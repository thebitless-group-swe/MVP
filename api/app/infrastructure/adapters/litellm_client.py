import json
from collections.abc import AsyncIterator, Sequence

import httpx

from ...core.domain.values import Message
from ...core.ports.llm_client import LLMClient, LLMProviderError
from ...settings import Settings

#read alto perche' in streaming misura la pausa fra due chunk, non tutta la
#generazione. Tenete connect < read, c'e' un test che lo controlla.
CONNECT_TIMEOUT_SECONDS = 10.0
READ_TIMEOUT_SECONDS = 180.0
WRITE_TIMEOUT_SECONDS = 30.0
POOL_TIMEOUT_SECONDS = 10.0

SSE_DATA_PREFIX = "data:"
SSE_DONE_MARKER = "[DONE]"


class LiteLLMClient(LLMClient):
    """Client SSE per un gateway LiteLLM (API compatibile OpenAI)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.litellm_base_url,
            timeout=httpx.Timeout(
                connect=CONNECT_TIMEOUT_SECONDS,
                read=READ_TIMEOUT_SECONDS,
                write=WRITE_TIMEOUT_SECONDS,
                pool=POOL_TIMEOUT_SECONDS,
            ),
            headers={"Authorization": f"Bearer {settings.litellm_api_key}"},
        )

    async def aclose(self) -> None:
        """Chiude il client HTTP, va invocata allo shutdown dell'app."""
        await self._client.aclose()

    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        payload: dict = {
            "model": self._settings.litellm_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
        }
        #Alcuni gateway rispondono 400 a un max_tokens messo a null.
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        try:
            async with self._client.stream(
                "POST", "/chat/completions", json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    content = self._parse_sse_line(line)
                    if content is not None:
                        yield content
        except httpx.ConnectError as exc:
            raise LLMProviderError(
                "Impossibile connettersi al provider LLM"
            ) from exc
        except httpx.TimeoutException as exc:
            raise LLMProviderError("Timeout nella richiesta al provider LLM") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMProviderError(
                f"Il provider LLM ha risposto con stato {exc.response.status_code}"
            ) from exc

    @staticmethod
    def _parse_sse_line(line: str) -> str | None:
        """Estrae delta.content da una riga SSE, None se la riga va ignorata.

        Occhio, la stringa vuota e' un content valido e va restituita.
        """
        line = line.strip()
        if not line.startswith(SSE_DATA_PREFIX):
            return None
        data = line[len(SSE_DATA_PREFIX) :].strip()
        if data == SSE_DONE_MARKER:
            return None
        try:
            payload = json.loads(data)
            return payload["choices"][0]["delta"].get("content")
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise LLMProviderError("Risposta SSE malformata dal provider LLM") from exc
