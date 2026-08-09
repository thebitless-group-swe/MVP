"""Test unitario dello use case di generazione da link.

Segue la struttura fissata dal pilota in test_summarize_service.py: nessun
`TestClient`, nessun adattatore, nessuna rete. E' l'unico dei sette use case a
dipendere da due porte, quindi qui i doppi sono due — `ContentExtractor` e
`LLMClient` — e cio' che si verifica e' il cablaggio fra loro: che il testo
estratto dalla prima finisca nel prompt consegnato alla seconda, che la seconda
non venga interpellata quando la prima fallisce, e che lo stream torni al
chiamante invariato e ancora freddo.

Divisione delle responsabilita' con i test vicini, la stessa degli altri sei use
case: il *contenuto* dei messaggi (ruoli, istruzione di lunghezza, assenza di
leak) e' del prompt builder ed e' coperto in test_prompts.py; la formattazione
SSE e il 503 sono dell'adattatore di trasporto e sono coperti in
test_streaming_helper.py e test_exception_503.py; il modo in cui una pagina
diventa testo — pagina vuota, contenuto assente, eccezione del client — e'
dell'adattatore ed e' coperto in test_tavily_extractor.py. Qui non si ripete
nulla di tutto questo.
"""

from collections.abc import AsyncIterator

import pytest

from app.core.domain.values import MAX_TEXT_LENGTH, Length
from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError
from app.core.services.generate_from_link import (
    MAX_URL_LENGTH,
    FetchError,
    InvalidLinkError,
    fetch_and_extract,
    generate_from_link,
    validate_link,
)
from app.llm.prompts import LENGTH_INSTRUCTIONS, build_generate_from_link_messages
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

    def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        self.stream_calls += 1
        return super().stream(messages)


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


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


# L'errore del link non valido resta un FetchError per chi non ha motivo di
# distinguerlo, ma e' un sottotipo: e' su questo che la rotta appoggia il 400.
def test_validate_link_rejects_too_long_url_with_the_invalid_link_subtype() -> None:
    long_url = "https://example.com/" + "a" * MAX_URL_LENGTH

    with pytest.raises(InvalidLinkError):
        validate_link(long_url)


# Il cablaggio vero e proprio: il testo estratto dalla prima porta arriva alla
# seconda dentro il prompt costruito dal builder. La parametrizzazione sulle tre
# lunghezze e' cio' che rende il test capace di accorgersi di un parametro perso
# per strada: ignorare `length` passerebbe comunque su "medio", che e' il valore
# che il DTO usa come default.
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


# Lo use case delega alla porta e non tocca i chunk: quelli emessi dal client
# arrivano al chiamante nello stesso ordine e senza trasformazioni.
async def test_generate_from_link_returns_the_chunks_yielded_by_the_port(
    dummy_content_extractor: ContentExtractor,
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = await generate_from_link(
        URL, "medio", dummy_content_extractor, dummy_llm_client
    )

    assert await _collect(stream) == DummyLLMClient.DEFAULT_CHUNKS


# Lo stream torna freddo anche qui, benche' l'`await` abbia gia' eseguito
# estrazione e costruzione del prompt: e' la proprieta' che permette a
# `sse_response` di intercettare un errore "early" del provider mentre puo'
# ancora rispondere 503, e all'utente di vedere il testo comparire a mano a
# mano. Il contatore dello spione distingue le due meta': la porta LLM e' stata
# invocata, il suo stream non e' stato consumato.
async def test_generate_from_link_does_not_consume_the_llm_port_before_the_caller(
    dummy_content_extractor: ContentExtractor,
) -> None:
    llm = LLMClientSpia()

    stream = await generate_from_link(URL, "medio", dummy_content_extractor, llm)

    assert llm.stream_calls == 1
    assert llm.received_messages is None

    await _collect(stream)

    assert llm.received_messages is not None


# Estrazione fallita: l'errore emerge dall'`await`, dove la rotta puo' ancora
# tradurlo in 503, e la porta LLM non viene mai interpellata — nessuna chiamata
# al provider per una pagina che non si e' riusciti a leggere.
async def test_generate_from_link_fails_before_reaching_the_llm_port(
    failing_content_extractor: ContentExtractor,
) -> None:
    llm = LLMClientSpia()

    with pytest.raises(FetchError):
        await generate_from_link(URL, "medio", failing_content_extractor, llm)

    assert llm.stream_calls == 0


# URL gia' scartato dalla validazione: nessuna richiesta di rete parte, e
# l'eccezione e' il sottotipo su cui la rotta appoggia il 400.
async def test_generate_from_link_rejects_a_too_long_url_without_touching_the_ports(
) -> None:
    extractor = ExtractorSpia()
    llm = LLMClientSpia()
    long_url = "https://example.com/" + "a" * MAX_URL_LENGTH

    with pytest.raises(InvalidLinkError):
        await generate_from_link(long_url, "medio", extractor, llm)

    assert extractor.extract_calls == 0
    assert llm.stream_calls == 0


# Il cap del dominio vale sul testo che finisce nel prompt, non solo su quello
# che `fetch_and_extract` restituisce: e' il prompt a raggiungere il provider, e
# un extractor prolisso non deve poter gonfiare la richiesta.
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
