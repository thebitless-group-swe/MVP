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

#Messaggi in linguaggio naturale con azione correttiva (R-8-Q-Ob)
_URL_TOO_LONG_DETAIL = (
    "L'indirizzo del link è troppo lungo. Incollane uno più breve e riprova."
)
_FETCH_FAILED_DETAIL = (
    "Non è stato possibile leggere il contenuto della pagina. "
    "Controlla che il link sia corretto e raggiungibile, poi riprova."
)


@router.post("/generate-from-link")
async def generate_from_link(
    payload: LinkRequest,
    request: Request,
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    #Forma dell'url gia' validata da HttpUrl in LinkRequest: resta la lunghezza
    url = str(payload.url)
    try:
        validate_link(url)
    except FetchError as exc:
        raise HTTPException(status_code=400, detail=_URL_TOO_LONG_DETAIL) from exc

    try:
        text = await fetch_and_extract(url)
    except FetchError as exc:
        logger.exception("Estrazione contenuto fallita per il link richiesto")
        raise HTTPException(status_code=503, detail=_FETCH_FAILED_DETAIL) from exc

    generation_prompt = (
        "Scrivi un testo originale in italiano evitando frasi introduttive di "
        f"qualsiasi tipo basato sul seguente contenuto estratto da link: {text}"
    )
    messages = build_generate_messages(generation_prompt, payload.length)
    return await sse_response(
        request, client.stream(messages), "generate-from-link", logger
    )
