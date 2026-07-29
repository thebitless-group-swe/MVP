from collections.abc import AsyncIterator
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..schemas import GenerateRequest
from ..llm import get_llm_client
from ..llm.client import LLMClient
from ..llm.errors import LLMProviderError
from ..llm.prompts import build_generate_messages

router = APIRouter(prefix="/api", tags=["generate"])

logger = logging.getLogger(__name__)

_SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"

@router.post("/generate")
async def generate(
    payload: GenerateRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_generate_messages(payload.prompt, payload.length)
    stream = client.stream(messages)

    try:
        first_chunk = await anext(stream)
        stream_exhausted = False
    except StopAsyncIteration:
        first_chunk = None
        stream_exhausted = True
    except LLMProviderError:
        logger.exception("Errore provider LLM durante apertura stream generazione")
        await stream.aclose()
        raise HTTPException(
            status_code=503,
            detail=_SERVICE_UNAVAILABLE_DETAIL,
        )

    async def event_stream() -> AsyncIterator[str]:
        try:
            if not stream_exhausted:
                if await request.is_disconnected():
                    logger.info("Client disconnesso, chiudo stream generazione")
                    return
                yield f"data: {first_chunk}\n\n"

                async for chunk in stream:
                    if await request.is_disconnected():
                        logger.info("Client disconnesso, chiudo stream generazione")
                        return
                    yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except LLMProviderError:
            logger.exception("Errore provider LLM durante stream generazione")
            return
        finally:
            await stream.aclose()

    return StreamingResponse(event_stream(), media_type="text/event-stream")