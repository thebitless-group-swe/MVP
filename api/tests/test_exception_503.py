"""Test B-11: gestione di LLMProviderError nella route POST /api/summarize.

Verifica il contratto del caso d'errore provider (UC 62):
  - status 503
  - body {"detail": "Servizio temporaneamente non disponibile"}
  - nessun leak di api_key, stacktrace o nome dell'eccezione interna.

Il provider e' simulato da DummyErrorLLMClient, il cui stream() solleva
LLMProviderError prima di emettere qualunque chunk (caso "early"): la route
deve intercettarlo PRIMA di restituire StreamingResponse e rispondere 503.
"""
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient

from app.llm import get_llm_client
from app.llm.client import LLMClient
from app.llm.errors import LLMProviderError
from app.main import app
from app.settings import get_settings

#Valore fittizio e riconoscibile: se comparisse nella response sarebbe un leak.
SENTINEL_API_KEY = "sk-SECRET-SENTINEL-12345"

#Testo >= 10 caratteri: supera la validazione di TextRequest (Field min_length=10).
VALID_TEXT = "Un testo abbastanza lungo per superare la validazione. Lorem ipsum dolor sit amet."


class DummyErrorLLMClient(LLMClient):
    """Client LLM finto che fallisce subito sollevando LLMProviderError.

    Il `yield` dopo il raise e' irraggiungibile, ma necessario perche' Python
    riconosca stream() come async generator (coerente con l'interfaccia
    LLMClient). Nel messaggio includiamo la SENTINEL_API_KEY per dimostrare
    che, anche se l'eccezione interna la contiene, non trapela al client.
    """

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        raise LLMProviderError(
            f"Errore interno provider con chiave {SENTINEL_API_KEY}"
        )
        yield  # pragma: no cover - irraggiungibile, rende stream un async generator


class TestLLMProviderError503:
    @pytest.fixture(autouse=True)
    def _override_with_error_client(self, monkeypatch: pytest.MonkeyPatch):
        #Inietta il client che fallisce al posto del LiteLLMClient reale.
        app.dependency_overrides[get_llm_client] = lambda: DummyErrorLLMClient()
        #Configura una api_key sentinella NON vuota: il default "" renderebbe
        #inutile il test di no-leak ("" e' sottostringa di qualunque stringa).
        #get_settings() e' lru_cache: ritorna il singleton usato dall'app.
        monkeypatch.setattr(get_settings(), "litellm_api_key", SENTINEL_API_KEY)
        yield
        app.dependency_overrides.clear()

    @pytest.fixture
    def client(self) -> TestClient:
        return TestClient(app)

    def test_llm_provider_error_returns_503(self, client: TestClient) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        assert response.status_code == 503

    def test_llm_provider_error_detail_message(self, client: TestClient) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        #Messaggio esatto vincolato da UC 62.
        assert response.json()["detail"] == "Servizio temporaneamente non disponibile"

    def test_llm_provider_error_no_api_key_leak(self, client: TestClient) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        #La api_key non deve comparire in NESSUNA parte della response.
        assert SENTINEL_API_KEY not in str(response.status_code)
        assert SENTINEL_API_KEY not in str(response.headers)
        assert SENTINEL_API_KEY not in response.text

    def test_llm_provider_error_no_stacktrace_leak(self, client: TestClient) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        body = response.text
        #Nessun dettaglio interno (stacktrace o nome dell'eccezione) nel body.
        assert "Traceback" not in body
        assert "LLMProviderError" not in body
