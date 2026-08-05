from ..core.ports.content_extractor import ContentExtractor, ContentExtractorError

MAX_URL_LENGTH = 2_048

class FetchError(Exception):
    """Errore durante l'estrazione del contenuto della pagina."""
    pass

def validate_link(url: str) -> None:
    if len(url) > MAX_URL_LENGTH:
        raise FetchError("URL troppo lungo")

async def fetch_and_extract(url: str, extractor: ContentExtractor) -> str:
    try:
        return await extractor.extract(url)
    except ContentExtractorError as exc:
        raise FetchError(str(exc)) from exc