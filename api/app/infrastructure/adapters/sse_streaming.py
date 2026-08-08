"""Adattatore di trasporto: da stream di chunk LLM a risposta SSE HTTP.

Sta sotto `infrastructure/adapters/` perche' e' il modulo che conosce HTTP —
`StreamingResponse`, `HTTPException`, `Request.is_disconnected()` — e il formato
degli eventi SSE. Finche' viveva in `llm/streaming.py`, quel package importava
FastAPI accanto ai prompt, cioe' teneva il trasporto e il dominio sotto lo
stesso nome.
"""
import logging
from collections.abc import AsyncGenerator, AsyncIterator

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from ...core.ports.llm_client import LLMProviderError

#Messaggio vincolato da UC 62: non modificare, tradurre o abbreviare.
SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"


def _format_sse(chunk: str) -> str:
    """Formatta un chunk come evento SSE conforme alla specifica.

    Nella specifica SSE un evento e' una o piu' righe `data:` chiuse da una riga
    vuota, e il valore di un campo non puo' contenere a capo. Emettere
    `f"data: {chunk}\\n\\n"` con un chunk multiriga produce quindi righe prive di
    prefisso, che il client scarta: non si perdeva il solo `\\n`, si perdeva
    tutto il testo che lo seguiva. Poiche' tutte le funzioni AI producono
    Markdown (titoli, elenchi, paragrafi, blocchi di codice), la perdita era
    sistematica su ogni risposta non banale.

    Una riga `data:` per ogni riga del contenuto; il client le riunisce con
    `\\n`. Un contenuto di una sola riga produce esattamente il formato
    precedente, quindi il cambiamento e' trasparente per i chunk senza a capo.
    """
    return "".join(f"data: {line}\n" for line in chunk.split("\n")) + "\n"


SSE_DONE_EVENT = "data: [DONE]\n\n"

#Evento terminale di errore: e' cio' che rende il fallimento a meta' stream
#distinguibile dal completamento. Senza, il client vedeva solo la chiusura
#della connessione e la interpretava come successo, mostrando all'utente un
#testo troncato senza alcun segnale (R-80-F-Ob, R-110-F-Ob, UC 72).
SSE_ERROR_EVENT = "event: error\n" + _format_sse(SERVICE_UNAVAILABLE_DETAIL)

_module_logger = logging.getLogger(__name__)


async def sse_response(
    request: Request,
    stream: AsyncGenerator[str, None],
    log_label: str,
    logger: logging.Logger | None = None,
) -> StreamingResponse:
    """Trasforma uno stream di chunk LLM in una StreamingResponse SSE.

    `log_label` identifica l'operazione nei messaggi di log; `logger` e' quello
    della route chiamante.
    """
    log = logger if logger is not None else _module_logger

    #Consumiamo il primo chunk QUI, prima di restituire StreamingResponse.
    #Starlette invia http.response.start (status 200) PRIMA di iterare il
    #generatore: dopo non e' piu' possibile rispondere 503. Un LLMProviderError
    #"early" (es. auth/HTTP error del provider, sollevato prima del primo
    #chunk) viene cosi' intercettato e convertito in 503.
    try:
        first_chunk = await anext(stream)
        stream_exhausted = False
    except StopAsyncIteration:
        #Stream vuoto ma valido: nessun chunk, solo marker di fine.
        first_chunk = None
        stream_exhausted = True
    except LLMProviderError as exc:
        log.exception("Errore provider LLM durante apertura stream %s", log_label)
        await stream.aclose()
        raise HTTPException(
            status_code=503,
            detail=SERVICE_UNAVAILABLE_DETAIL,
        ) from exc

    async def event_stream() -> AsyncIterator[str]:
        try:
            if not stream_exhausted:
                if await request.is_disconnected():
                    log.info("Client disconnesso, chiudo stream %s", log_label)
                    return
                yield _format_sse(first_chunk)

                async for chunk in stream:
                    if await request.is_disconnected():
                        log.info("Client disconnesso, chiudo stream %s", log_label)
                        return
                    yield _format_sse(chunk)
            yield SSE_DONE_EVENT
        except LLMProviderError:
            #Errore mid-stream: gli header (200) sono gia' partiti, non e'
            #possibile rispondere 503. Emettiamo un evento terminale di errore
            #-- il client lo distingue da [DONE] e avvisa l'utente -- e
            #logghiamo server-side, senza propagare stacktrace o dettagli del
            #provider nel corpo della risposta.
            log.exception("Errore provider LLM durante stream %s", log_label)
            yield SSE_ERROR_EVENT
            return
        finally:
            await stream.aclose()

    #event-stream setta l'header in maniera che identifichi l'SSE, lo processa a chunk
    return StreamingResponse(event_stream(), media_type="text/event-stream")
