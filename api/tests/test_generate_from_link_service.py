"""Test dello use case di estrazione contenuto da link.

`fetch_and_extract` dipende solo dalla porta `ContentExtractor`: i test usano le
fixture di conftest.py e non conoscono l'adattatore concreto. I due comportamenti
dello use case sono la delega alla porta e la traduzione dell'errore di porta in
`FetchError`; la distinzione fra le cause del fallimento (pagina vuota, contenuto
assente, eccezione del client) appartiene all'adattatore ed e' coperta in
test_tavily_extractor.py.
"""

import pytest

from app.core.domain.values import MAX_TEXT_LENGTH
from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError
from app.core.services.generate_from_link import (
    MAX_URL_LENGTH,
    FetchError,
    fetch_and_extract,
    validate_link,
)


class ExtractorProlisso(ContentExtractor):
    async def extract(self, url: str) -> str:
        return "x" * (MAX_TEXT_LENGTH * 3)


# Extractor che estrae correttamente → fetch_and_extract ritorna il contenuto della porta
async def test_fetch_and_extract_returns_extractor_content(
    dummy_content_extractor: ContentExtractor,
) -> None:
    result = await fetch_and_extract("https://example.com", dummy_content_extractor)

    assert result == "Contenuto di esempio per il test."


# Extractor che fallisce → l'errore di porta diventa FetchError, con messaggio e causa preservati
async def test_fetch_and_extract_wraps_extractor_error_in_fetch_error(
    failing_content_extractor: ContentExtractor,
) -> None:
    with pytest.raises(FetchError) as exc_info:
        await fetch_and_extract("https://example.com", failing_content_extractor)

    assert str(exc_info.value) == "Errore simulato durante l'estrazione"
    assert isinstance(exc_info.value.__cause__, ContentExtractorError)


async def test_fetch_and_extract_applies_the_domain_cap_to_any_extractor() -> None:
    result = await fetch_and_extract("https://example.com", ExtractorProlisso())

    assert len(result) == MAX_TEXT_LENGTH


async def test_fetch_and_extract_leaves_short_content_untouched(
    dummy_content_extractor: ContentExtractor,
) -> None:
    result = await fetch_and_extract("https://example.com", dummy_content_extractor)

    assert result == "Contenuto di esempio per il test."


# Schema e forma dell'URL sono ora validati da HttpUrl in LinkRequest: la
# copertura di quei casi vive in test_config_hygiene.py. Qui resta il solo
# vincolo che lo schema non esprime, cioe' la lunghezza massima.
@pytest.mark.parametrize("url", [
    "http://example.com",
    "https://example.com",
    "https://example.com/path?query=1",
])
def test_validate_link_accepts_urls_within_the_length_limit(url: str) -> None:
    validate_link(url)  # non deve lanciare


# URL troppo lungo: deve lanciare FetchError
def test_validate_link_rejects_too_long_url() -> None:
    long_url = "https://example.com/" + "a" * MAX_URL_LENGTH

    with pytest.raises(FetchError):
        validate_link(long_url)
