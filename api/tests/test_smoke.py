from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.llm import get_llm_client
from app.main import app
from tests.conftest import DummyLLMClient


def test_health(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "model" in body


def test_generate_returns_sse(
    client: TestClient, dummy_llm_client: DummyLLMClient
) -> None:
    app.dependency_overrides[get_llm_client] = lambda: dummy_llm_client

    try:
        response = client.post(
            "/api/generate", json={"prompt": "Scrivi un testo sul mare"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
    finally:
        app.dependency_overrides.clear()


def test_generate_from_link_invalid_url_returns_4xx(client: TestClient) -> None:
    response = client.post(
        "/api/generate-from-link", json={"url": "ftp://example.com"}
    )
    assert 400 <= response.status_code < 500


@patch("app.routes.generate_link.TavilyExtractor")
def test_generate_from_link_valid_url_returns_sse(
    mock_tavily: AsyncMock,
    client: TestClient,
    dummy_llm_client: DummyLLMClient,
) -> None:
    mock_extractor = AsyncMock()
    mock_extractor.extract = AsyncMock(return_value="Contenuto estratto di esempio.")
    mock_tavily.return_value = mock_extractor

    app.dependency_overrides[get_llm_client] = lambda: dummy_llm_client

    try:
        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
    finally:
        app.dependency_overrides.clear()