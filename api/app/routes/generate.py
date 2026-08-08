import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..llm import get_llm_client
from ..llm.prompts import build_generate_messages
from ..llm.streaming import sse_response
from ..schemas import GenerateRequest

router = APIRouter(prefix="/api", tags=["generate"])

logger = logging.getLogger(__name__)


@router.post("/generate")
async def generate(
    payload: GenerateRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_generate_messages(payload.prompt, payload.length)
    return await sse_response(request, client.stream(messages), "generazione", logger)
