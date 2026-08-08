import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..llm import get_llm_client
from ..llm.prompts import build_critique_messages
from ..llm.streaming import sse_response
from ..schemas import CritiqueRequest

router = APIRouter(prefix="/api", tags=["critique"])

logger = logging.getLogger(__name__)


@router.post("/critique")
async def critique(
    payload: CritiqueRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_critique_messages(payload.text, payload.hat)
    return await sse_response(request, client.stream(messages), "analisi critica", logger)
