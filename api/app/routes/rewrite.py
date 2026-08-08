import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..llm import get_llm_client
from ..llm.prompts import build_rewrite_messages
from ..llm.streaming import sse_response
from ..schemas import RewriteRequest

router = APIRouter(prefix="/api", tags=["rewrite"])

logger = logging.getLogger(__name__)


@router.post("/rewrite")
async def rewrite(
    payload: RewriteRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_rewrite_messages(payload.text, payload.style)
    return await sse_response(request, client.stream(messages), "riscrittura", logger)
