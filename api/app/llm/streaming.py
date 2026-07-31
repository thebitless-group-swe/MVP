import logging
from collections.abc import AsyncGenerator, AsyncIterator

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from .errors import LLMProviderError

#Messaggio vincolato da UC 62: non modificare, tradurre o abbreviare.
SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"

SSE_DONE_EVENT = "data: [DONE]\n\n"

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
                #Stringa formattata SSE; "\n\n" separa gli eventi, standard SSE
                yield f"data: {first_chunk}\n\n"

                async for chunk in stream:
                    if await request.is_disconnected():
                        log.info("Client disconnesso, chiudo stream %s", log_label)
                        return
                    yield f"data: {chunk}\n\n"
            yield SSE_DONE_EVENT
        except LLMProviderError:
            #Errore mid-stream: gli header (200) sono gia' partiti, non e'
            #possibile rispondere 503. Logghiamo server-side e chiudiamo in
            #modo pulito, senza propagare stacktrace/dettagli al client.
            log.exception("Errore provider LLM durante stream %s", log_label)
            return
        finally:
            await stream.aclose()

    #event-stream setta l'header in maniera che identifichi l'SSE, lo processa a chunk
    return StreamingResponse(event_stream(), media_type="text/event-stream")
