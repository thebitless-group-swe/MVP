import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..schemas import LinkRequest
from ..llm import get_llm_client
from ..llm.client import LLMClient
from ..llm.errors import LLMProviderError
from ..llm.prompts import build_generate_messages
from ..llm.fetch_url import validate_link, fetch_and_extract, FetchError

router = APIRouter(prefix="/api", tags=["generate-link"])

logger = logging.getLogger(__name__)

_SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"
_INVALID_URL_DETAIL = "URL non valido"


@router.post("/generate-from-link")
async def generate_from_link(
    payload: LinkRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    try:
        validate_link(payload.url)
    except FetchError as exc:
        raise HTTPException(status_code=400, detail=_INVALID_URL_DETAIL) from exc

    try:
        text = await fetch_and_extract(payload.url)
    except FetchError as exc:
        raise HTTPException(status_code=503, detail=_SERVICE_UNAVAILABLE_DETAIL) from exc

    generation_prompt = (
        f"Scrivi un testo originale in italiano evitando frasi introduttive di qualsiasi tipo basato sul seguente contenuto estratto da link: {text}"
    )
    messages = build_generate_messages(generation_prompt, payload.length)
    stream = client.stream(messages)

    try:
        first_chunk = await anext(stream)
        stream_exhausted = False
    except StopAsyncIteration:
        first_chunk = None
        stream_exhausted = True
    except LLMProviderError:
        logger.exception("Errore provider LLM durante apertura stream generate-from-link")
        await stream.aclose()
        raise HTTPException(status_code=503, detail=_SERVICE_UNAVAILABLE_DETAIL)

    async def event_stream() -> AsyncIterator[str]:
        try:
            if not stream_exhausted:
                if await request.is_disconnected():
                    logger.info("Client disconnesso, chiudo stream generate-from-link")
                    return
                yield f"data: {first_chunk}\n\n"

                async for chunk in stream:
                    if await request.is_disconnected():
                        logger.info("Client disconnesso, chiudo stream generate-from-link")
                        return
                    yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except LLMProviderError:
            logger.exception("Errore provider LLM durante stream generate-from-link")
            return
        finally:
            await stream.aclose()

    return StreamingResponse(event_stream(), media_type="text/event-stream")