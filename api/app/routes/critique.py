import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..core.services.critique import critique as critique_service
from ..infrastructure.adapters.sse_streaming import sse_response
from ..llm import get_llm_client
from ..schemas import CritiqueRequest

router = APIRouter(prefix="/api", tags=["critique"])

logger = logging.getLogger(__name__)


@router.post("/critique")
async def critique(
    payload: CritiqueRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    #Alias sull'import: il caso d'uso si chiama come questo handler, e il nome
    #dell'handler non puo' cambiare perche' FastAPI ci deriva l'operationId.
    chunks = critique_service(payload.text, payload.hat, client)
    return await sse_response(request, chunks, "analisi critica", logger)
