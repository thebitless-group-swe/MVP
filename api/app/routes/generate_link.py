import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..llm import get_llm_client
from ..llm.client import LLMClient
from ..llm.fetch_url import FetchError, fetch_and_extract, validate_link
from ..llm.prompts import build_generate_messages
from ..llm.streaming import sse_response
from ..schemas import LinkRequest

router = APIRouter(prefix="/api", tags=["generate-link"])

logger = logging.getLogger(__name__)

_SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"
_INVALID_URL_DETAIL = "URL non valido"


@router.post("/generate-from-link")
async def generate_from_link(
    payload: LinkRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    try:
        validate_link(payload.url)
    except FetchError as exc:
        raise HTTPException(status_code=400, detail=_INVALID_URL_DETAIL) from exc

    try:
        text = await fetch_and_extract(payload.url)
    except FetchError as exc:
        raise HTTPException(status_code=503, detail=_SERVICE_UNAVAILABLE_DETAIL) from exc

    generation_prompt = (
        "Scrivi un testo originale in italiano evitando frasi introduttive di "
        f"qualsiasi tipo basato sul seguente contenuto estratto da link: {text}"
    )
    messages = build_generate_messages(generation_prompt, payload.length)
    return await sse_response(
        request, client.stream(messages), "generate-from-link", logger
    )
