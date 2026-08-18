import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ...core.ports.content_extractor import ContentExtractor
from ...core.ports.llm_client import LLMClient
from ...core.services.generate_from_link import (
    FetchError,
    InvalidLinkError,
)
from ...core.services.generate_from_link import (
    generate_from_link as generate_from_link_service,
)
from ...dependencies import get_content_extractor, get_llm_client
from ..schemas import LinkRequest
from ..sse_streaming import sse_response

router = APIRouter(prefix="/api", tags=["generate-link"])
logger = logging.getLogger(__name__)

#Non metteteci mai dentro il testo dell'eccezione, finirebbe nella risposta.
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
    extractor: ContentExtractor = Depends(get_content_extractor),
) -> StreamingResponse:
    try:
        chunks = await generate_from_link_service(
            str(payload.url), payload.length, extractor, client
        )
    #InvalidLinkError estende FetchError, quindi va catturata per prima o il
    #link scartato si prende il 503 al posto del 400.
    except InvalidLinkError as exc:
        raise HTTPException(status_code=400, detail=_URL_TOO_LONG_DETAIL) from exc
    except FetchError as exc:
        logger.exception("Estrazione contenuto fallita per il link richiesto")
        raise HTTPException(status_code=503, detail=_FETCH_FAILED_DETAIL) from exc

    return await sse_response(request, chunks, "generate-from-link", logger)
