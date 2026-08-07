import pytest
from fastapi.testclient import TestClient

from app.llm import get_content_extractor, get_llm_client
from app.main import app
from tests.conftest import DummyContentExtractor, DummyLLMClient


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


@pytest.mark.usefixtures("content_extractor_override")
def test_generate_from_link_invalid_url_returns_4xx(client: TestClient) -> None:
    response = client.post(
        "/api/generate-from-link", json={"url": "ftp://example.com"}
    )
    assert 400 <= response.status_code < 500


def test_generate_from_link_valid_url_returns_sse(
    client: TestClient,
    dummy_llm_client: DummyLLMClient,
) -> None:
    #Prima serviva `@patch("app.routes.generate_link.TavilyExtractor")`: il test
    #doveva conoscere la classe concreta usata dalla rotta, e si rompeva appena
    #quella cambiava. Ora si sostituisce la porta, che e' il contratto vero.
    app.dependency_overrides[get_llm_client] = lambda: dummy_llm_client
    app.dependency_overrides[get_content_extractor] = DummyContentExtractor

    try:
        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
    finally:
        app.dependency_overrides.clear()
