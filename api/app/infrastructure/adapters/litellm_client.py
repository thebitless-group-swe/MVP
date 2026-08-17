import json
from collections.abc import AsyncIterator, Sequence

import httpx

from ...core.domain.values import Message
from ...core.ports.llm_client import LLMClient, LLMProviderError
from ...settings import Settings

#I due guasti che l'attesa misura sono diversi, e prima erano lo stesso numero.
#
#`httpx.AsyncClient(timeout=60.0)` assegna 60 s a *ciascuna* delle quattro fasi,
#compresa la lettura — che su una risposta in streaming non misura la durata
#della generazione ma la **pausa fra due chunk**. Il primo chunk arriva quando il
#modello ha finito di pensare: su un modello grande o su un gateway carico puo'
#volerci piu' di un minuto, ed e' stato misurato (101 s su gemma3:27b). Con un
#tetto di 60 s quella richiesta moriva di `ReadTimeout` e l'utente riceveva un
#503 «servizio non disponibile» per una generazione che stava solo andando
#piano: il guasto peggiore possibile, perche' indistinguibile da un guasto vero.
#
#La connessione ha il problema opposto. O si apre subito o dall'altra parte non
#c'e' nessuno: concederle i minuti che serve alla lettura significherebbe tenere
#l'utente fermo davanti a un servizio spento. Da qui i due valori, e il test
#`test_la_lettura_attende_piu_a_lungo_della_connessione` che ne fissa l'ordine.
CONNECT_TIMEOUT_SECONDS = 10.0
READ_TIMEOUT_SECONDS = 180.0
WRITE_TIMEOUT_SECONDS = 30.0
POOL_TIMEOUT_SECONDS = 10.0

SSE_DATA_PREFIX = "data:"
SSE_DONE_MARKER = "[DONE]"


class LiteLLMClient(LLMClient):
    """Client SSE per un gateway LiteLLM (API compatibile OpenAI).

    Sta accanto a `TavilyExtractor` perche' ha lo stesso ruolo: implementare una
    porta di `core/ports/` parlando con un servizio esterno. Finche' viveva in
    `llm/client.py`, quel package teneva sotto lo stesso nome il dominio
    (`prompts.py`) e l'unico modulo del backend che conosce httpx e il formato
    SSE del provider.

    Le costanti si spostano con la classe: descrivono il protocollo del
    provider, non una regola di dominio. Quelle di timeout restano pubbliche
    perche' i test le usano per verificare la configurazione del trasporto.
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
            timeout=httpx.Timeout(
                connect=CONNECT_TIMEOUT_SECONDS,
                read=READ_TIMEOUT_SECONDS,
                write=WRITE_TIMEOUT_SECONDS,
                pool=POOL_TIMEOUT_SECONDS,
            ),
            headers={"Authorization": f"Bearer {settings.litellm_api_key}"},
        )

    async def aclose(self) -> None:
        """Chiude il client HTTP sottostante (da invocare allo shutdown dell'app)."""
        await self._client.aclose()

    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        payload: dict = {
            "model": self._settings.litellm_model,
            #L'unico punto del backend in cui un messaggio prende la forma di
            #filo del provider. Il dominio parla di `Message`; le chiavi
            #"role" e "content" sono protocollo, e il protocollo si conosce
            #qui. Che la traduzione stia in una riga e' il criterio con cui si
            #verifica di non aver modellato troppo: vedi `Message`.
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
        }
        #Aggiunta condizionale, non chiave a `None`: i due casi non sono lo
        #stesso per il provider. `"max_tokens": null` e' accettato dallo schema
        #OpenAI ma non da tutti i gateway compatibili, e su alcuni un `null` in
        #piu' e' un 400. Assente significa «decidi tu», che e' cio' che le
        #quattro funzioni senza tetto vogliono dire.
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
