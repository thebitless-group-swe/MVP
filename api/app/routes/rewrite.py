import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..core.services.rewrite import rewrite as rewrite_service
from ..dependencies import get_llm_client
from ..infrastructure.adapters.sse_streaming import sse_response
from ..schemas import RewriteRequest

router = APIRouter(prefix="/api", tags=["rewrite"])

logger = logging.getLogger(__name__)


@router.post("/rewrite")
async def rewrite(
    payload: RewriteRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    #Alias sull'import: il caso d'uso si chiama come questo handler, e il nome
    #dell'handler non puo' cambiare perche' FastAPI ci deriva l'operationId.
    chunks = rewrite_service(payload.text, payload.style, client)
    return await sse_response(request, chunks, "riscrittura", logger)
