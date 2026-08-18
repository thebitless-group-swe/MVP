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
    payload: TextRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    #Vale per tutte e sette le rotte. L'alias `_service` serve perche' il
    #nome dell'handler non si puo' cambiare, FastAPI ci ricava l'operationId.
    chunks = summarize_service(payload.text, payload.length, client)
    return await sse_response(request, chunks, "riassunto", logger)
