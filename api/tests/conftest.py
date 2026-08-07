from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.llm.client import LLMClient
from app.main import app
from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class DummyLLMClient(LLMClient):
    """Client LLM finto per test: yielda chunk fissi senza I/O."""

    DEFAULT_CHUNKS = ["chunk1 ", "chunk2 ", "fine"]

    def __init__(self, chunks: list[str] | None = None) -> None:
        self._chunks = chunks if chunks is not None else self.DEFAULT_CHUNKS

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
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
