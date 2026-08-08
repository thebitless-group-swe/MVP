import pytest
from fastapi.testclient import TestClient

from app.core.domain.values import MIN_PROMPT_LENGTH, MIN_TEXT_LENGTH, NO_ERRORS_MARKER

SOGLIE = [
    ("min_text_length", MIN_TEXT_LENGTH),
    ("min_prompt_length", MIN_PROMPT_LENGTH),
]


class TestSogliePubblicate:
    @pytest.mark.parametrize(("campo", "atteso"), SOGLIE)
    def test_la_soglia_e_esposta_col_valore_di_dominio(
        self, client: TestClient, campo: str, atteso: int
    ) -> None:
        assert client.get("/api/constants").json()[campo] == atteso

    @pytest.mark.parametrize(("campo", "atteso"), SOGLIE)
    def test_la_soglia_e_un_const_nello_schema_openapi(
        self, client: TestClient, campo: str, atteso: int
    ) -> None:
        schema = client.get("/openapi.json").json()
        campo_schema = schema["components"]["schemas"]["ApiConstants"][
            "properties"
        ][campo]

        assert campo_schema["const"] == atteso


class TestFormaDellEndpoint:
    def test_pubblica_esattamente_i_campi_previsti(self, client: TestClient) -> None:
        assert client.get("/api/constants").json() == {
            "no_errors_marker": NO_ERRORS_MARKER,
            "min_text_length": MIN_TEXT_LENGTH,
            "min_prompt_length": MIN_PROMPT_LENGTH,
        }


class TestCoerenzaConIDto:
    def test_il_testo_sotto_la_soglia_pubblicata_e_rifiutato(
        self, client: TestClient
    ) -> None:
        soglia = client.get("/api/constants").json()["min_text_length"]

        response = client.post("/api/summarize", json={"text": "x" * (soglia - 1)})

        assert response.status_code == 422

    def test_le_istruzioni_sotto_la_soglia_pubblicata_sono_rifiutate(
        self, client: TestClient
    ) -> None:
        soglia = client.get("/api/constants").json()["min_prompt_length"]

        response = client.post("/api/generate", json={"prompt": "x" * (soglia - 1)})

        assert response.status_code == 422
