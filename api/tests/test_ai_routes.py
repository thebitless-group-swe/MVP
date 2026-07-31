"""Test B-04: le quattro nuove route AI."""
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient

from app.llm import get_llm_client
from app.llm.client import LLMClient
from app.llm.errors import LLMProviderError
from app.llm.streaming import SERVICE_UNAVAILABLE_DETAIL
from app.main import app
from tests.conftest import DummyLLMClient

VALID_TEXT = "Un testo abbastanza lungo per superare la validazione di schema."

#(path, payload valido, payload invalido)
ROUTE_CASES = [
    (
        "/api/translate",
        {"text": VALID_TEXT, "target_language": "inglese"},
        {"text": VALID_TEXT, "target_language": "klingon"},
    ),
    (
        "/api/rewrite",
        {"text": VALID_TEXT, "style": "formale"},
        {"text": VALID_TEXT, "style": "barocco"},
    ),
    (
        "/api/grammar",
        {"text": VALID_TEXT},
        {"text": "corto"},
    ),
    (
        "/api/critique",
        {"text": VALID_TEXT, "hat": "nero"},
        {"text": VALID_TEXT, "hat": "arcobaleno"},
    ),
]

ROUTE_IDS = [case[0] for case in ROUTE_CASES]


class EarlyErrorLLMClient(LLMClient):
    """Fallisce prima del primo chunk."""

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        raise LLMProviderError("Provider non raggiungibile")
        yield  # pragma: no cover - rende stream un async generator


@pytest.fixture
def dummy_override() -> Iterator[None]:
    app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def early_error_override() -> Iterator[None]:
    app.dependency_overrides[get_llm_client] = lambda: EarlyErrorLLMClient()
    yield
    app.dependency_overrides.clear()


@pytest.mark.usefixtures("dummy_override")
class TestHappyPath:
    @pytest.mark.parametrize(
        ("path", "valid", "_invalid"), ROUTE_CASES, ids=ROUTE_IDS
    )
    def test_returns_200_sse(
        self, client: TestClient, path: str, valid: dict, _invalid: dict
    ) -> None:
        response = client.post(path, json=valid)

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

    @pytest.mark.parametrize(
        ("path", "valid", "_invalid"), ROUTE_CASES, ids=ROUTE_IDS
    )
    def test_streams_dummy_chunks_in_sse_format(
        self, client: TestClient, path: str, valid: dict, _invalid: dict
    ) -> None:
        body = client.post(path, json=valid).text

        assert "data: chunk1 \n\n" in body
        assert "data: chunk2 \n\n" in body
        assert "data: fine\n\n" in body
        assert body.endswith("data: [DONE]\n\n")


@pytest.mark.usefixtures("dummy_override")
class TestInvalidPayload:
    @pytest.mark.parametrize(
        ("path", "_valid", "invalid"), ROUTE_CASES, ids=ROUTE_IDS
    )
    def test_returns_422(
        self, client: TestClient, path: str, _valid: dict, invalid: dict
    ) -> None:
        assert client.post(path, json=invalid).status_code == 422


@pytest.mark.usefixtures("early_error_override")
class TestProviderUnavailable:
    @pytest.mark.parametrize(
        ("path", "valid", "_invalid"), ROUTE_CASES, ids=ROUTE_IDS
    )
    def test_early_provider_error_returns_503(
        self, client: TestClient, path: str, valid: dict, _invalid: dict
    ) -> None:
        response = client.post(path, json=valid)

        assert response.status_code == 503
        assert response.json()["detail"] == SERVICE_UNAVAILABLE_DETAIL
