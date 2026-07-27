from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.llm.client import LLMClient
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class DummyLLMClient(LLMClient):
    """Client LLM finto per test: yielda chunk fissi senza I/O."""

    DEFAULT_CHUNKS = ["chunk1 ", "chunk2 ", "fine"]

    def __init__(self, chunks: list[str] | None = None) -> None:
        self._chunks = chunks if chunks is not None else self.DEFAULT_CHUNKS

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        for chunk in self._chunks:
            yield chunk


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def dummy_llm_client() -> DummyLLMClient:
    return DummyLLMClient()


@pytest.fixture
def sse_chunks() -> str:
    return (FIXTURES_DIR / "litellm_sse.txt").read_text(encoding="utf-8")
