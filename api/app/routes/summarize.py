import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..infrastructure.adapters.sse_streaming import sse_response
from ..llm import get_llm_client
from ..llm.prompts import build_summarize_messages
from ..schemas import TextRequest

router = APIRouter(prefix="/api", tags=["summarize"])

logger = logging.getLogger(__name__)


@router.post("/summarize")
async def summarize(
    #Separiamo il reale contenuto dalla richiesta HTTP di fastAPI
    payload: TextRequest,
    request: Request,
    #Depends permette di aspettare prima di chiamare la funzione desiderata
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_summarize_messages(payload.text, payload.length)
    return await sse_response(request, client.stream(messages), "riassunto", logger)
