import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..llm import get_llm_client
from ..llm.prompts import build_translate_messages
from ..llm.streaming import sse_response
from ..schemas import TranslateRequest

router = APIRouter(prefix="/api", tags=["translate"])

logger = logging.getLogger(__name__)


@router.post("/translate")
async def translate(
    payload: TranslateRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_translate_messages(payload.text, payload.target_language)
    return await sse_response(request, client.stream(messages), "traduzione", logger)
