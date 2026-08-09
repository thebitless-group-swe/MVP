from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError
from app.core.ports.llm_client import LLMClient
from app.llm import get_content_extractor
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class DummyLLMClient(LLMClient):
    """Client LLM finto per test: yielda chunk fissi senza I/O.

    Registra in `received_messages` i messaggi con cui viene invocato: e' cosi'
    che i test degli use case di `core/services/` verificano il prompt prodotto
    senza passare da HTTP. La registrazione avviene alla prima iterazione dello
    stream, non alla chiamata di `stream()`, perche' il corpo di un generatore
    asincrono non viene eseguito finche' nessuno lo consuma; resta `None`
    finche' lo stream e' freddo.
    """

    DEFAULT_CHUNKS = ["chunk1 ", "chunk2 ", "fine"]

    def __init__(self, chunks: list[str] | None = None) -> None:
        self._chunks = chunks if chunks is not None else self.DEFAULT_CHUNKS
        self.received_messages: list[dict] | None = None

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        self.received_messages = messages
        for chunk in self._chunks:
            yield chunk

class DummyContentExtractor(ContentExtractor):
    """ContentExtractor finto per test: ritorna contenuto statico."""
    async def extract(self, url: str) -> str:
        return "Contenuto di esempio per il test."


class FailingContentExtractor(ContentExtractor):
    """ContentExtractor finto che fallisce sempre."""
    async def extract(self, url: str) -> str:
        raise ContentExtractorError("Errore simulato durante l'estrazione")

@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def dummy_llm_client() -> DummyLLMClient:
    return DummyLLMClient()

@pytest.fixture
def dummy_content_extractor() -> ContentExtractor:
    return DummyContentExtractor()


@pytest.fixture
def failing_content_extractor() -> ContentExtractor:
    return FailingContentExtractor()


@pytest.fixture
def content_extractor_override() -> Iterator[None]:
    """Fa risolvere `get_content_extractor` su un doppio, per la durata del test.

    Serve a ogni test che chiama /api/generate-from-link e non sta verificando
    la configurazione. FastAPI risolve le dipendenze prima di validare il
    corpo: senza override, in un ambiente senza TAVILY_API_KEY la rotta
    risponde 503 anche a una richiesta malformata, e un test sulla validazione
    non arriva mai a esercitare cio' che vuole verificare.
    """
    app.dependency_overrides[get_content_extractor] = DummyContentExtractor
    yield
    app.dependency_overrides.pop(get_content_extractor, None)

@pytest.fixture
def sse_chunks() -> str:
    return (FIXTURES_DIR / "litellm_sse.txt").read_text(encoding="utf-8")
