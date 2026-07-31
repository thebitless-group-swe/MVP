from unittest.mock import MagicMock, patch

import pytest

from app.llm.fetch_url import MAX_URL_LENGTH, FetchError, fetch_and_extract, validate_link

SAMPLE_CONTENT = "Questo è un contenuto di esempio estratto dalla pagina."


# Client Tavily mockato → ritorna contenuto di esempio → fetch_and_extract ritorna testo non vuoto
@patch("app.llm.fetch_url.TavilyClient")
async def test_fetch_and_extract_returns_text(mock_tavily_client: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_instance.extract.return_value = {
        "results": [{"raw_content": SAMPLE_CONTENT}]
    }
    mock_tavily_client.return_value = mock_instance

    result = await fetch_and_extract("https://example.com")

    assert result == SAMPLE_CONTENT


# Client solleva errore (es. eccezione di rete) → fetch_and_extract propaga errore gestito
@patch("app.llm.fetch_url.TavilyClient")
async def test_fetch_and_extract_client_exception_raises(mock_tavily_client: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_instance.extract.side_effect = Exception("boom")
    mock_tavily_client.return_value = mock_instance

    with pytest.raises(FetchError):
        await fetch_and_extract("https://example.com")


# Client solleva errore (URL non valido / no content) → fetch_and_extract propaga errore gestito
@patch("app.llm.fetch_url.TavilyClient")
async def test_fetch_and_extract_no_content_raises(mock_tavily_client: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_instance.extract.return_value = {"results": []}
    mock_tavily_client.return_value = mock_instance

    with pytest.raises(FetchError):
        await fetch_and_extract("https://invalid-url")


# Input lungo → output troncato ≤ cap
@patch("app.llm.fetch_url.TavilyClient")
async def test_fetch_and_extract_truncates_long_content(mock_tavily_client: MagicMock) -> None:
    long_content = "a" * 20_000
    mock_instance = MagicMock()
    mock_instance.extract.return_value = {
        "results": [{"raw_content": long_content}]
    }
    mock_tavily_client.return_value = mock_instance

    result = await fetch_and_extract("https://example.com")

    assert len(result) <= 12_000


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
