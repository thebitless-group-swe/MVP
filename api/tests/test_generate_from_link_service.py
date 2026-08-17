"""Test unitario dello use case di generazione da link."""

from collections.abc import AsyncIterator, Sequence

import pytest

from app.core.domain.prompts.rules import LENGTH_INSTRUCTIONS
from app.core.domain.prompts.templates import build_generate_from_link_messages
from app.core.domain.values import MAX_TEXT_LENGTH, Length, Message
from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError
from app.core.services.generate_from_link import (
    MAX_URL_LENGTH,
    FetchError,
    InvalidLinkError,
    fetch_and_extract,
    generate_from_link,
    validate_link,
)
from tests.conftest import DummyContentExtractor, DummyLLMClient

CONTENUTO_ESTRATTO = "Contenuto di esempio per il test."
URL = "https://example.com"


class ExtractorProlisso(ContentExtractor):
    async def extract(self, url: str) -> str:
        return "x" * (MAX_TEXT_LENGTH * 3)


class ExtractorSpia(DummyContentExtractor):
    """Come `DummyContentExtractor`, ma registra se e' stato interpellato.

    Serve al solo test che deve provare un'assenza: per un URL gia' scartato non
    deve partire alcuna richiesta di rete, e senza contatore l'unico modo di
    verificarlo sarebbe non verificarlo.
    """

    def __init__(self) -> None:
        self.extract_calls = 0

    async def extract(self, url: str) -> str:
        self.extract_calls += 1
        return await super().extract(url)


class LLMClientSpia(DummyLLMClient):
    """Come `DummyLLMClient`, ma distingue "chiamato" da "consumato".

    `received_messages` si popola alla prima iterazione dello stream, quindi da
    solo non separa "la porta non e' stata invocata" da "la porta e' stata
    invocata e lo stream e' ancora freddo" — ed e' esattamente la distinzione su
    cui poggiano il test dello stream freddo e quello dell'estrazione fallita.
    """

    def __init__(self) -> None:
        super().__init__()
        self.stream_calls = 0

    def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        self.stream_calls += 1
        return super().stream(messages, max_tokens)


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


async def test_fetch_and_extract_returns_extractor_content(
    dummy_content_extractor: ContentExtractor,
) -> None:
    result = await fetch_and_extract("https://example.com", dummy_content_extractor)

    assert result == "Contenuto di esempio per il test."


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


@pytest.mark.parametrize("url", [
    "http://example.com",
    "https://example.com",
    "https://example.com/path?query=1",
])
def test_validate_link_accepts_urls_within_the_length_limit(url: str) -> None:
    validate_link(url)  # non deve lanciare


def test_validate_link_rejects_too_long_url() -> None:
    long_url = "https://example.com/" + "a" * MAX_URL_LENGTH

    with pytest.raises(FetchError):
        validate_link(long_url)


def test_validate_link_rejects_too_long_url_with_the_invalid_link_subtype() -> None:
    long_url = "https://example.com/" + "a" * MAX_URL_LENGTH

    with pytest.raises(InvalidLinkError):
        validate_link(long_url)


@pytest.mark.parametrize("length", list(LENGTH_INSTRUCTIONS.keys()))
async def test_generate_from_link_passes_the_extracted_text_to_the_llm_port(
    length: Length,
    dummy_content_extractor: ContentExtractor,
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = await generate_from_link(
        URL, length, dummy_content_extractor, dummy_llm_client
    )
    await _collect(stream)

    assert dummy_llm_client.received_messages == build_generate_from_link_messages(
        CONTENUTO_ESTRATTO, length
    )


async def test_generate_from_link_returns_the_chunks_yielded_by_the_port(
    dummy_content_extractor: ContentExtractor,
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = await generate_from_link(
        URL, "medio", dummy_content_extractor, dummy_llm_client
    )

    assert await _collect(stream) == DummyLLMClient.DEFAULT_CHUNKS


async def test_generate_from_link_does_not_consume_the_llm_port_before_the_caller(
    dummy_content_extractor: ContentExtractor,
) -> None:
    llm = LLMClientSpia()

    stream = await generate_from_link(URL, "medio", dummy_content_extractor, llm)

    assert llm.stream_calls == 1
    assert llm.received_messages is None

    await _collect(stream)

    assert llm.received_messages is not None


async def test_generate_from_link_fails_before_reaching_the_llm_port(
    failing_content_extractor: ContentExtractor,
) -> None:
    llm = LLMClientSpia()

    with pytest.raises(FetchError):
        await generate_from_link(URL, "medio", failing_content_extractor, llm)

    assert llm.stream_calls == 0


async def test_generate_from_link_rejects_a_too_long_url_without_touching_the_ports(
) -> None:
    extractor = ExtractorSpia()
    llm = LLMClientSpia()
    long_url = "https://example.com/" + "a" * MAX_URL_LENGTH

    with pytest.raises(InvalidLinkError):
        await generate_from_link(long_url, "medio", extractor, llm)

    assert extractor.extract_calls == 0
    assert llm.stream_calls == 0


async def test_generate_from_link_caps_the_extracted_text_in_the_prompt(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = await generate_from_link(
        URL, "medio", ExtractorProlisso(), dummy_llm_client
    )
    await _collect(stream)

    assert dummy_llm_client.received_messages == build_generate_from_link_messages(
        "x" * MAX_TEXT_LENGTH, "medio"
    )
