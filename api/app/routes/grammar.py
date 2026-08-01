import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..llm import get_llm_client
from ..llm.client import LLMClient
from ..llm.prompts import build_grammar_messages
from ..llm.streaming import sse_response
from ..schemas import GrammarRequest

router = APIRouter(prefix="/api", tags=["grammar"])

logger = logging.getLogger(__name__)


@router.post("/grammar")
async def grammar(
    payload: GrammarRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_grammar_messages(payload.text)
    return await sse_response(request, client.stream(messages), "correzione", logger)
