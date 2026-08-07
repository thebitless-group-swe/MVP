"""Test B-06: igiene della configurazione."""
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.llm import get_llm_client
from app.llm.fetch_url import MAX_URL_LENGTH
from app.main import app
from app.schemas import LinkRequest
from app.settings import Settings
from tests.conftest import DummyLLMClient


@pytest.fixture
def dummy_override() -> Iterator[None]:
    app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient()
    yield
    app.dependency_overrides.clear()


class TestSettingsReadsTavilyKey:
    def test_tavily_key_comes_from_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TAVILY_API_KEY", "tvly-test-key")

        #Istanza nuova, non il singleton lru_cache
        assert Settings().tavily_api_key == "tvly-test-key"

    def test_tavily_key_defaults_to_empty_string(self) -> None:
        assert isinstance(Settings().tavily_api_key, str)


class TestLinkRequestUrlValidation:
    @pytest.mark.parametrize(
        "url",
        ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "example.com"],
    )
    def test_invalid_url_is_rejected_by_the_schema(self, url: str) -> None:
        with pytest.raises(ValidationError):
            LinkRequest(url=url)

    @pytest.mark.parametrize(
        "url",
        ["http://example.com", "https://example.com", "https://example.com/path?query=1"],
    )
    def test_valid_url_is_accepted(self, url: str) -> None:
        assert LinkRequest(url=url)


@pytest.mark.usefixtures("dummy_override", "content_extractor_override")
class TestGenerateFromLinkErrors:
    @pytest.mark.parametrize(
        "url", ["ftp://example.com", "non-un-url", "javascript:alert(1)"]
    )
    def test_invalid_url_returns_422(self, client: TestClient, url: str) -> None:
        response = client.post("/api/generate-from-link", json={"url": url})

        assert response.status_code == 422

    def test_too_long_url_returns_400_with_readable_message(
        self, client: TestClient
    ) -> None:
        #Sopra MAX_URL_LENGTH ma sotto il limite di HttpUrl (2083)
        prefix = "https://example.com/"
        long_url = prefix + "a" * (MAX_URL_LENGTH + 12 - len(prefix))
        assert len(long_url) > MAX_URL_LENGTH

        response = client.post("/api/generate-from-link", json={"url": long_url})

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "troppo lungo" in detail
        assert "riprova" in detail.lower()
        assert "Traceback" not in detail
        assert "FetchError" not in detail
