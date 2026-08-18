import os
from collections.abc import AsyncIterator, Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

#NON spostate questi due setenv sotto gli import. app.main costruisce le
#settings all'import per il CORS e get_settings e' lru_cache, quindi si
#ritroverebbe in cache le chiavi vuote e mezza suite salterebbe.
os.environ["LITELLM_API_KEY"] = "sk-chiave-finta-per-i-test"
os.environ["TAVILY_API_KEY"] = "tvly-chiave-finta-per-i-test"

from app.core.domain.values import Message
from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError
from app.core.ports.llm_client import LLMClient
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

    #Distingue «non ha chiesto il tetto» da «lo stream non e' mai partito»,
    #altrimenti un test sull'assenza passa senza consumare niente.
    NON_INVOCATO = object()

    def __init__(self, chunks: list[str] | None = None) -> None:
        self._chunks = chunks if chunks is not None else self.DEFAULT_CHUNKS
        self.received_messages: Sequence[Message] | None = None
        self.received_max_tokens: int | None | object = self.NON_INVOCATO

    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        self.received_messages = messages
        self.received_max_tokens = max_tokens
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
def sse_chunks() -> str:
    return (FIXTURES_DIR / "litellm_sse.txt").read_text(encoding="utf-8")
