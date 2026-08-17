"""Use case: generare un testo a partire dal link di una pagina (UC67.2).

Non trasformatelo in generatore con yield. Il corpo non partirebbe finche'
nessuno consuma lo stream, quindi l'estrazione e il suo errore finirebbero
dentro sse_response e la rotta non potrebbe piu' tradurli in 503.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_generate_from_link_messages
from ..domain.values import LENGTH_MAX_TOKENS, MAX_TEXT_LENGTH, Length
from ..ports.content_extractor import ContentExtractor, ContentExtractorError
from ..ports.llm_client import LLMClient

MAX_URL_LENGTH = 2_048

class FetchError(Exception):
    """Errore durante l'estrazione del contenuto della pagina."""
    pass

class InvalidLinkError(FetchError):
    """Link scartato prima di qualunque richiesta di rete."""
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
    validate_link(url)
    text = await fetch_and_extract(url, extractor)

    return llm.stream(
        build_generate_from_link_messages(text, length),
        max_tokens=LENGTH_MAX_TOKENS[length],
    )
