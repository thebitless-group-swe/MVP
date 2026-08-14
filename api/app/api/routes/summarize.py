import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ...core.ports.llm_client import LLMClient
from ...core.services.summarize import summarize as summarize_service
from ...dependencies import get_llm_client
from ..schemas import TextRequest
from ..sse_streaming import sse_response

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
    #Tre passi e nessuna logica di dominio: il DTO e' gia' validato da Pydantic,
    #lo use case costruisce il prompt e parla con la porta, sse_response
    #formatta. La route non importa piu' i prompt.
    chunks = summarize_service(payload.text, payload.length, client)
    return await sse_response(request, chunks, "riassunto", logger)
