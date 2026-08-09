import json
from collections.abc import AsyncIterator

import httpx

from ...core.ports.llm_client import LLMClient, LLMProviderError
from ...settings import Settings

HTTP_TIMEOUT_SECONDS = 60.0
SSE_DATA_PREFIX = "data:"
SSE_DONE_MARKER = "[DONE]"


class LiteLLMClient(LLMClient):
    """Client SSE per un gateway LiteLLM (API compatibile OpenAI).

    Sta accanto a `TavilyExtractor` perche' ha lo stesso ruolo: implementare una
    porta di `core/ports/` parlando con un servizio esterno. Finche' viveva in
    `llm/client.py`, quel package teneva sotto lo stesso nome il dominio
    (`prompts.py`) e l'unico modulo del backend che conosce httpx e il formato
    SSE del provider.

    Le tre costanti si spostano con la classe: descrivono il protocollo del
    provider, non una regola di dominio. `HTTP_TIMEOUT_SECONDS` resta pubblica
    perche' i test la usano per verificare la configurazione del trasporto.
    """

    def __init__(self, settings: Settings) -> None:
        #La configurazione arriva da chi costruisce l'adattatore: leggerla qui
        #da `get_settings()` legherebbe una classe di infrastruttura al
        #singleton globale e renderebbe impossibile istanziarla nei test senza
        #toccare l'ambiente. Stessa scelta di `TavilyExtractor`; il composition
        #root (`app/dependencies.py`) e' l'unico a sapere da dove arriva.
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.litellm_base_url,
            timeout=HTTP_TIMEOUT_SECONDS,
            headers={"Authorization": f"Bearer {settings.litellm_api_key}"},
        )

    async def aclose(self) -> None:
        """Chiude il client HTTP sottostante (da invocare allo shutdown dell'app)."""
        await self._client.aclose()

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        payload = {
            "model": self._settings.litellm_model,
            "messages": messages,
            "stream": True,
        }
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
        """Estrae delta.content da una riga SSE OpenAI-compatibile.

        Ritorna None per le righe da ignorare (vuote, non-`data:`, `[DONE]`,
        chunk senza content come quello finale con finish_reason). La stringa
        vuota "" è un content valido e viene restituita.
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
