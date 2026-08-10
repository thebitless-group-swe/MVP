"""Test di validazione per i Pydantic schemas dell'API.

Verifica i vincoli di TextRequest in linea con il contratto
POST /api/summarize e con UC 63 (gestione testo insufficiente)
dell'analisi dei requisiti.
"""
import pytest
from pydantic import ValidationError

from app.api.schemas import TextRequest


class TestTextRequest:
    """Verifica i vincoli di validazione di TextRequest.

    Contratto API POST /api/summarize:
    - text: stringa, minimo 10 caratteri (UC 63)
    """

    def test_valido_con_testo_sufficiente(self):
        """Testo di almeno 10 caratteri crea istanza valida."""
        req = TextRequest(text="testo valido di almeno dieci caratteri")
        assert req.text == "testo valido di almeno dieci caratteri"

    def test_solleva_validation_error_se_campo_mancante(self):
        """Campo text obbligatorio: assenza solleva ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            TextRequest()  # type: ignore[call-arg]

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("text",)
        assert errors[0]["type"] == "missing"

    def test_solleva_validation_error_su_stringa_vuota(self):
        """Stringa vuota viola il vincolo min_length=10."""
        with pytest.raises(ValidationError) as exc_info:
            TextRequest(text="")

        errors = exc_info.value.errors()
        assert errors[0]["type"] == "string_too_short"
        assert errors[0]["loc"] == ("text",)

    def test_solleva_validation_error_su_testo_troppo_corto(self):
        """Testo < 10 caratteri viola min_length (UC 63)."""
        with pytest.raises(ValidationError) as exc_info:
            TextRequest(text="ciao")  # 4 caratteri

        errors = exc_info.value.errors()
        assert errors[0]["type"] == "string_too_short"
        assert errors[0]["loc"] == ("text",)
