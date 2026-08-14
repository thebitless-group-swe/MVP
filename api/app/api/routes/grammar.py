import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ...core.ports.llm_client import LLMClient
from ...core.services.grammar import grammar as grammar_service
from ...dependencies import get_llm_client
from ..schemas import GrammarRequest
from ..sse_streaming import sse_response

router = APIRouter(prefix="/api", tags=["grammar"])

logger = logging.getLogger(__name__)


@router.post("/grammar")
async def grammar(
    payload: GrammarRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    #Alias sull'import: il caso d'uso si chiama come questo handler, e il nome
    #dell'handler non puo' cambiare perche' FastAPI ci deriva l'operationId.
    chunks = grammar_service(payload.text, client)
    return await sse_response(request, chunks, "correzione", logger)
