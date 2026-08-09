"""Use case: generare un testo a partire dal link di una pagina (UC 63).

Vive in `core/services/` perche' dipende solo dalle porte `ContentExtractor` e
`LLMClient`: non conosce gli adattatori che le soddisfano ne' il trasporto che
le invoca. L'estrazione era gia' cosi' quando stava in `llm/fetch_url.py` — era
l'unico modulo del backend a rispettare pienamente l'inversione delle
dipendenze — ma il package lo teneva fra dominio e infrastruttura, dove nessuno
lo avrebbe cercato.

Forma e convenzioni sono quelle fissate dal pilota in summarize.py. E' l'unico
dei sette use case a dipendere da due porte, e questo si riflette in due punti:

  - **Le porte restano gli ultimi parametri, nell'ordine in cui vengono usate**
    — prima `extractor`, poi `llm`: la firma si legge come la sequenza del caso
    d'uso.
  - **`generate_from_link` e' `async def` con `return`, non un generatore
    asincrono con `yield`.** Con `yield` il corpo non verrebbe eseguito finche'
    nessuno consuma lo stream: l'estrazione — e il suo fallimento — slitterebbe
    dentro `sse_response`, e la rotta non potrebbe piu' tradurla in 503 prima di
    aver iniziato a streammare. Con `return`, l'`await` del chiamante esegue
    subito estrazione e costruzione del prompt e restituisce comunque uno stream
    ancora freddo, la proprieta' che summarize.py rivendica.

Le due eccezioni: `InvalidLinkError` sottotipa `FetchError` perche' i due
fallimenti hanno esiti HTTP diversi — link scartato senza toccare la rete e'
400, estrazione fallita e' 503 — ma il chiamante che non volesse distinguerli
puo' continuare a catturare il solo `FetchError`.
"""
from collections.abc import AsyncIterator

from ...llm.prompts import build_generate_messages
from ..domain.values import MAX_TEXT_LENGTH, Length
from ..ports.content_extractor import ContentExtractor, ContentExtractorError
from ..ports.llm_client import LLMClient

MAX_URL_LENGTH = 2_048

class FetchError(Exception):
    """Errore durante l'estrazione del contenuto della pagina."""
    pass

class InvalidLinkError(FetchError):
    """Il link e' inutilizzabile: scartato prima di qualunque richiesta di rete."""
    pass

def validate_link(url: str) -> None:
    if len(url) > MAX_URL_LENGTH:
        raise InvalidLinkError("URL troppo lungo")

async def fetch_and_extract(url: str, extractor: ContentExtractor) -> str:
    try:
        contenuto = await extractor.extract(url)
    except ContentExtractorError as exc:
        raise FetchError(str(exc)) from exc

    return contenuto[:MAX_TEXT_LENGTH]

async def generate_from_link(
    url: str,
    length: Length,
    extractor: ContentExtractor,
    llm: LLMClient,
) -> AsyncIterator[str]:
    """Genera un testo dal contenuto della pagina a `url`, come stream di chunk.

    Raises:
        InvalidLinkError: se il link viene scartato dalla validazione, prima di
            qualunque richiesta di rete.
        FetchError: se l'estrazione del contenuto fallisce.
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non all'`await` di questa funzione.
    """
    validate_link(url)
    text = await fetch_and_extract(url, extractor)

    generation_prompt = (
        "Scrivi un testo originale in italiano evitando frasi introduttive di "
        f"qualsiasi tipo basato sul seguente contenuto estratto da link: {text}"
    )
    return llm.stream(build_generate_messages(generation_prompt, length))
