"""Da stream di chunk LLM a risposta SSE HTTP."""
import logging
from collections.abc import AsyncGenerator, AsyncIterator

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMProviderError

#Testo vincolato da UC72, non modificare ne' tradurre.
SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"


def _format_sse(chunk: str) -> str:
    #Non accorciate in f"data: {chunk}\n\n". Un campo SSE non puo' contenere
    #a capo, quindi con un chunk multiriga il client butta via tutto quello che
    #segue il primo \n, e noi produciamo sempre Markdown.
    return "".join(f"data: {line}\n" for line in chunk.split("\n")) + "\n"


SSE_DONE_EVENT = "data: [DONE]\n\n"

#Distingue un errore a meta' stream da un completamento, senza il client
#mostrava il testo troncato come se fosse finito (R-80-F-Ob, UC72).
SSE_ERROR_EVENT = "event: error\n" + _format_sse(SERVICE_UNAVAILABLE_DETAIL)

_module_logger = logging.getLogger(__name__)


async def sse_response(
    request: Request,
    stream: AsyncGenerator[str, None],
    log_label: str,
    logger: logging.Logger | None = None,
) -> StreamingResponse:
    log = logger if logger is not None else _module_logger

    #Il primo chunk si consuma QUI. Starlette manda lo status 200 prima di
    #iterare il generatore, e dopo il 503 non e' piu' possibile.
    try:
        first_chunk = await anext(stream)
        stream_exhausted = False
    except StopAsyncIteration:
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
            #Header gia' partiti, niente 503, si manda l'evento di errore.
            log.exception("Errore provider LLM durante stream %s", log_label)
            yield SSE_ERROR_EVENT
            return
        finally:
            await stream.aclose()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
