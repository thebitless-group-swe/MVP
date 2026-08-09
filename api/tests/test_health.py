"""Test del health endpoint GET / e del singleton Settings.

Verifica che:
1. La route ritorni shape {"status": "ok", "model": <str>}.
2. Il campo `model` rifletta il valore corrente di get_settings().litellm_model.
3. Modifiche runtime al singleton settings vengano riflesse nella risposta
   (verifica indirettamente che la route non hardcodi il valore).
"""
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_settings


class TestHealthEndpoint:
    """Verifica shape e dinamicità della route GET /."""

    def test_health_ritorna_status_ok(self, client: TestClient) -> None:
        """La route ritorna 200 con status='ok'."""
        response = client.get("/")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"

    def test_health_espone_modello_corrente(self, client: TestClient) -> None:
        """Il campo `model` corrisponde a get_settings().litellm_model."""
        response = client.get("/")

        body = response.json()
        assert body["model"] == get_settings().litellm_model

    def test_health_riflette_modifiche_runtime_settings(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(get_settings(), "litellm_model", "test-model-override")

        response = client.get("/")

        assert response.status_code == 200
        assert response.json()["model"] == "test-model-override"

    def test_health_shape_solo_status_e_model(self, client: TestClient) -> None:
        """Il body contiene solo `status` e `model`: niente campi extra che
        potrebbero leakare configurazione."""
        response = client.get("/")

        body = response.json()
        assert set(body.keys()) == {"status", "model"}

    def test_health_non_espone_api_key(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(get_settings(), "litellm_api_key", "sk-segreto-non-leakare")

        response = client.get("/")

        body_text = response.text
        assert "sk-" not in body_text
        assert "segreto" not in body_text
        assert "non-leakare" not in body_text
