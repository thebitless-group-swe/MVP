"""Use case: ricavare il testo di una pagina a partire dal suo link.

Vive in `core/services/` perche' dipende solo dalla porta `ContentExtractor`:
non conosce l'adattatore che la soddisfa ne' il trasporto che lo invoca. Era
gia' cosi' quando stava in `llm/fetch_url.py` — era l'unico modulo del backend
a rispettare pienamente l'inversione delle dipendenze — ma il package lo teneva
fra dominio e infrastruttura, dove nessuno lo avrebbe cercato.
"""
from ..domain.values import MAX_TEXT_LENGTH
from ..ports.content_extractor import ContentExtractor, ContentExtractorError

MAX_URL_LENGTH = 2_048

class FetchError(Exception):
    """Errore durante l'estrazione del contenuto della pagina."""
    pass

def validate_link(url: str) -> None:
    if len(url) > MAX_URL_LENGTH:
        raise FetchError("URL troppo lungo")

async def fetch_and_extract(url: str, extractor: ContentExtractor) -> str:
    try:
        contenuto = await extractor.extract(url)
    except ContentExtractorError as exc:
        raise FetchError(str(exc)) from exc

    return contenuto[:MAX_TEXT_LENGTH]
