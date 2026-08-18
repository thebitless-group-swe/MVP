import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ...core.ports.llm_client import LLMClient
from ...core.services.generate import generate as generate_service
from ...dependencies import get_llm_client
from ..schemas import GenerateRequest
from ..sse_streaming import sse_response

router = APIRouter(prefix="/api", tags=["generate"])

logger = logging.getLogger(__name__)


@router.post("/generate")
async def generate(
    payload: GenerateRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    chunks = generate_service(payload.prompt, payload.length, client)
    return await sse_response(request, chunks, "generazione", logger)
