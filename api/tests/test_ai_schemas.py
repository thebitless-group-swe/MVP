"""Test B-02: enum e schemi delle quattro nuove richieste AI."""
from collections.abc import AsyncIterator, Iterator
from typing import get_args

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.ports.llm_client import LLMClient
from app.llm import get_llm_client
from app.main import app
from app.schemas import (
    CritiqueRequest,
    GrammarRequest,
    Hat,
    Language,
    RewriteRequest,
    Style,
    TranslateRequest,
)

VALID_TEXT = "Un testo abbastanza lungo per superare la validazione di schema."
SHORT_TEXT = "corto"


class SpyLLMClient(LLMClient):
    """Registra il numero di invocazioni di stream()."""

    def __init__(self) -> None:
        self.calls = 0

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        self.calls += 1
        yield "chunk"


@pytest.fixture
def spy_llm_client() -> Iterator[SpyLLMClient]:
    spy = SpyLLMClient()
    app.dependency_overrides[get_llm_client] = lambda: spy
    yield spy
    app.dependency_overrides.clear()


class TestEnumValues:
    def test_language_enum_matches_uc_53_1(self) -> None:
        assert set(get_args(Language)) == {
            "inglese",
            "francese",
            "tedesco",
            "spagnolo",
        }

    def test_style_enum_matches_uc_54_1(self) -> None:
        assert set(get_args(Style)) == {"formale", "informale", "accademico"}

    def test_hat_enum_has_the_six_hats(self) -> None:
        assert set(get_args(Hat)) == {
            "bianco",
            "rosso",
            "giallo",
            "nero",
            "verde",
            "blu",
        }


class TestSchemaValidation:
    def test_translate_request_valid(self) -> None:
        req = TranslateRequest(text=VALID_TEXT, target_language="inglese")
        assert req.target_language == "inglese"

    def test_translate_request_rejects_unknown_language(self) -> None:
        with pytest.raises(ValidationError):
            TranslateRequest(text=VALID_TEXT, target_language="klingon")

    def test_translate_request_requires_explicit_language(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            TranslateRequest(text=VALID_TEXT)  # type: ignore[call-arg]

        assert exc_info.value.errors()[0]["type"] == "missing"

    def test_rewrite_request_rejects_unknown_style(self) -> None:
        with pytest.raises(ValidationError):
            RewriteRequest(text=VALID_TEXT, style="barocco")

    def test_rewrite_request_requires_explicit_style(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            RewriteRequest(text=VALID_TEXT)  # type: ignore[call-arg]

        assert exc_info.value.errors()[0]["type"] == "missing"

    def test_critique_request_requires_explicit_hat(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            CritiqueRequest(text=VALID_TEXT)  # type: ignore[call-arg]

        assert exc_info.value.errors()[0]["type"] == "missing"

    @pytest.mark.parametrize(
        ("model", "extra"),
        [
            (TranslateRequest, {"target_language": "inglese"}),
            (RewriteRequest, {"style": "formale"}),
            (GrammarRequest, {}),
            (CritiqueRequest, {"hat": "nero"}),
        ],
    )
    def test_short_text_is_rejected(self, model, extra: dict) -> None:
        with pytest.raises(ValidationError) as exc_info:
            model(text=SHORT_TEXT, **extra)

        assert exc_info.value.errors()[0]["type"] == "string_too_short"


class TestInvalidPayloadNeverReachesProvider:
    """Su 422 di schema il provider non viene chiamato (UC 63)."""

    @pytest.mark.parametrize(
        ("path", "payload"),
        [
            #Valore fuori enum
            ("/api/translate", {"text": VALID_TEXT, "target_language": "klingon"}),
            ("/api/rewrite", {"text": VALID_TEXT, "style": "barocco"}),
            ("/api/critique", {"text": VALID_TEXT, "hat": "arcobaleno"}),
            #Testo sotto la soglia minima
            ("/api/translate", {"text": SHORT_TEXT, "target_language": "inglese"}),
            ("/api/rewrite", {"text": SHORT_TEXT, "style": "formale"}),
            ("/api/grammar", {"text": SHORT_TEXT}),
            ("/api/critique", {"text": SHORT_TEXT, "hat": "nero"}),
            #Campo obbligatorio assente
            ("/api/translate", {"text": VALID_TEXT}),
            ("/api/rewrite", {"text": VALID_TEXT}),
            ("/api/critique", {"text": VALID_TEXT}),
            ("/api/grammar", {}),
        ],
    )
    def test_invalid_payload_returns_422_without_calling_provider(
        self,
        client: TestClient,
        spy_llm_client: SpyLLMClient,
        path: str,
        payload: dict,
    ) -> None:
        response = client.post(path, json=payload)

        assert response.status_code == 422
        assert spy_llm_client.calls == 0
