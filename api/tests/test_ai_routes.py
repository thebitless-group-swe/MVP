"""Test B-04/B-05: le quattro nuove route AI."""
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.domain.values import NO_ERRORS_MARKER
from app.core.ports.llm_client import LLMClient, LLMProviderError
from app.dependencies import get_llm_client
from app.infrastructure.adapters.sse_streaming import SERVICE_UNAVAILABLE_DETAIL
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


class TestNoErrorsSentinel:
    """B-05: la sentinella attraversa lo stream intatta."""

    @pytest.fixture(autouse=True)
    def _override_with_sentinel_client(self) -> Iterator[None]:
        app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient(
            [NO_ERRORS_MARKER]
        )
        yield
        app.dependency_overrides.clear()

    def test_sentinel_reaches_the_client_intact(self, client: TestClient) -> None:
        response = client.post("/api/grammar", json={"text": VALID_TEXT})

        assert response.status_code == 200
        assert f"data: {NO_ERRORS_MARKER}\n\n" in response.text

    def test_sentinel_is_published_in_the_api_contract(
        self, client: TestClient
    ) -> None:
        assert client.get("/api/constants").json()["no_errors_marker"] == (
            NO_ERRORS_MARKER
        )

    def test_sentinel_is_a_const_in_the_openapi_schema(
        self, client: TestClient
    ) -> None:
        schema = client.get("/openapi.json").json()
        field = schema["components"]["schemas"]["ApiConstants"]["properties"][
            "no_errors_marker"
        ]

        assert field["const"] == NO_ERRORS_MARKER
