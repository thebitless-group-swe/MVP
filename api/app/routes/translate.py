import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.ports.llm_client import LLMClient
from ..core.services.translate import translate as translate_service
from ..infrastructure.adapters.sse_streaming import sse_response
from ..llm import get_llm_client
from ..schemas import TranslateRequest

router = APIRouter(prefix="/api", tags=["translate"])

logger = logging.getLogger(__name__)


@router.post("/translate")
async def translate(
    payload: TranslateRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    #Alias sull'import: il caso d'uso si chiama come questo handler, e il nome
    #dell'handler non puo' cambiare perche' FastAPI ci deriva l'operationId.
    chunks = translate_service(payload.text, payload.target_language, client)
    return await sse_response(request, chunks, "traduzione", logger)
