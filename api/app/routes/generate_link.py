import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..core.ports.content_extractor import ContentExtractor
from ..core.ports.llm_client import LLMClient
from ..core.services.generate_from_link import (
    FetchError,
    InvalidLinkError,
)
from ..core.services.generate_from_link import (
    generate_from_link as generate_from_link_service,
)
from ..dependencies import get_content_extractor, get_llm_client
from ..infrastructure.adapters.sse_streaming import sse_response
from ..schemas import LinkRequest

router = APIRouter(prefix="/api", tags=["generate-link"])
logger = logging.getLogger(__name__)

#Messaggi rivolti all'utente HTTP, non dominio: restano nella rotta. Non devono
#mai contenere il testo dell'eccezione, che finirebbe nel corpo della risposta.
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
    #Tre passi e nessuna logica di dominio: il DTO e' gia' validato da Pydantic,
    #lo use case estrae il contenuto e parla con la porta LLM, sse_response
    #formatta. L'await esegue l'estrazione qui, dove il fallimento e' ancora
    #traducibile in uno stato HTTP, e restituisce comunque uno stream freddo.
    try:
        chunks = await generate_from_link_service(
            str(payload.url), payload.length, extractor, client
        )
    #InvalidLinkError sottotipa FetchError: l'except del sottotipo va per primo,
    #altrimenti il link scartato riceverebbe il 503 dell'estrazione fallita.
    except InvalidLinkError as exc:
        raise HTTPException(status_code=400, detail=_URL_TOO_LONG_DETAIL) from exc
    except FetchError as exc:
        logger.exception("Estrazione contenuto fallita per il link richiesto")
        raise HTTPException(status_code=503, detail=_FETCH_FAILED_DETAIL) from exc

    return await sse_response(request, chunks, "generate-from-link", logger)
