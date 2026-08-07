"""Test dei global exception handler: HTTPException e RequestValidationError.

Verifica che ogni HTTPException sollevata dalle route venga mappata sullo
schema ErrorResponse(detail: str), come definito dal contratto API:
  POST /api/summarize -> 503 -> {"detail": "Servizio temporaneamente non disponibile"}

L'handler è registrato in app.main su fastapi.HTTPException e wrappa
exc.detail (cast a stringa) dentro ErrorResponse.model_dump().
"""
from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client_with_test_routes() -> Iterator[TestClient]:
    """TestClient sull'app reale con route fittizie per esercitare l'handler.

    Le route sono registrate dinamicamente con prefisso /__test__/ per
    evitare collisioni con route applicative reali. Il teardown dopo yield
    rimuove le route fittizie per non inquinare altre suite di test.

    Il test è isolato dall'implementazione di /api/summarize, quindi
    non dipende da B-09 di Davide né da B-11 di Anna.
    """

    async def _raise_418() -> None:
        raise HTTPException(status_code=418, detail="sono una teiera")

    async def _raise_500() -> None:
        raise HTTPException(status_code=500, detail="boom interno")

    async def _raise_400_dict_detail() -> None:
        # detail non-stringa: l'handler deve fare str() prima di serializzare
        raise HTTPException(status_code=400, detail={"campo": "errato"})

    app.add_api_route("/__test__/raise-418", _raise_418, methods=["GET"])
    app.add_api_route("/__test__/raise-500", _raise_500, methods=["GET"])
    app.add_api_route(
        "/__test__/raise-400-dict", _raise_400_dict_detail, methods=["GET"]
    )

    yield TestClient(app)

    # Cleanup: rimuovi le route di test per non inquinare altre suite
    app.router.routes = [
        r
        for r in app.router.routes
        if not (hasattr(r, "path") and r.path.startswith("/__test__/"))
    ]


class TestGlobalExceptionHandler:
    """Verifica che HTTPException venga mappata su ErrorResponse."""

    def test_http_exception_418_ritorna_shape_error_response(
        self, client_with_test_routes: TestClient
    ) -> None:
        """HTTPException(418, '...') -> status 418 + body {'detail': '...'}."""
        response = client_with_test_routes.get("/__test__/raise-418")

        assert response.status_code == 418
        assert response.json() == {"detail": "sono una teiera"}

    def test_http_exception_500_ritorna_shape_error_response(
        self, client_with_test_routes: TestClient
    ) -> None:
        """Anche errori server-side passano dall'handler globale."""
        response = client_with_test_routes.get("/__test__/raise-500")

        assert response.status_code == 500
        assert response.json() == {"detail": "boom interno"}

    def test_detail_non_stringa_viene_castato_a_stringa(
        self, client_with_test_routes: TestClient
    ) -> None:
        """Se detail non è stringa (es. dict), l'handler usa str() prima di serializzare.

        Questo blinda la shape del contratto: response sempre {detail: <stringa>},
        mai {detail: <oggetto>}.
        """
        response = client_with_test_routes.get("/__test__/raise-400-dict")

        assert response.status_code == 400
        body = response.json()
        assert "detail" in body
        assert isinstance(body["detail"], str)
        # Il cast str(dict) produce la repr Python: "{'campo': 'errato'}"
        assert body["detail"] == "{'campo': 'errato'}"

    def test_content_type_application_json(
        self, client_with_test_routes: TestClient
    ) -> None:
        """L'handler ritorna JSONResponse: Content-Type deve essere application/json."""
        response = client_with_test_routes.get("/__test__/raise-418")

        assert response.headers["content-type"].startswith("application/json")

    def test_body_contiene_solo_campo_detail(
        self, client_with_test_routes: TestClient
    ) -> None:
        """ErrorResponse ha solo campo `detail`: nessun campo extra deve trapelare."""
        response = client_with_test_routes.get("/__test__/raise-418")

        body = response.json()
        assert set(body.keys()) == {"detail"}


VALID_TEXT = "Un testo abbastanza lungo per superare la validazione di schema."


@pytest.mark.usefixtures("content_extractor_override")
class TestValidationExceptionHandler:
    """Il 422 di Pydantic deve avere la stessa forma di ogni altro errore.

    Senza handler dedicato FastAPI restituisce `detail` come array di oggetti,
    mentre ErrorResponse lo dichiara stringa e lo store del frontend lo tipizza
    `string | null`. Quegli oggetti contengono inoltre `type`, `loc`, `ctx` e
    rimandano indietro `input`, cioe' il testo scritto dall'utente: R-110-F-Ob
    vieta di esporre dettagli tecnici.
    """

    def test_detail_e_una_stringa(self, client: TestClient) -> None:
        response = client.post("/api/summarize", json={"text": "corto"})

        assert response.status_code == 422
        assert isinstance(response.json()["detail"], str)

    def test_body_ha_la_stessa_forma_degli_altri_errori(
        self, client: TestClient
    ) -> None:
        response = client.post("/api/summarize", json={"text": "corto"})

        assert set(response.json().keys()) == {"detail"}

    def test_non_rimanda_indietro_l_input_dell_utente(
        self, client: TestClient
    ) -> None:
        """`input` nella risposta di default e' il testo inviato dall'utente."""
        segreto = "PAROLA-RISERVATA-DELL-UTENTE"

        response = client.post("/api/summarize", json={"text": segreto[:9]})

        assert segreto[:9] not in response.text

    def test_non_espone_dettagli_tecnici(self, client: TestClient) -> None:
        """Nessuna traccia della struttura interna dell'errore Pydantic."""
        response = client.post(
            "/api/translate", json={"text": "corto", "target_language": "it"}
        )

        for tecnicismo in ("loc", "ctx", "string_too_short", "literal_error", "body"):
            assert tecnicismo not in response.text

    @pytest.mark.parametrize(
        ("path", "payload", "atteso"),
        [
            (
                "/api/summarize",
                {"text": "corto"},
                "Il campo «testo» deve contenere almeno 10 caratteri.",
            ),
            (
                "/api/translate",
                {"text": VALID_TEXT, "target_language": "inglese_sbagliato"},
                "Il valore indicato per «lingua di destinazione» non è fra quelli "
                "ammessi: scegline uno fra le opzioni proposte.",
            ),
            (
                "/api/rewrite",
                {"text": VALID_TEXT},
                "Il campo «stile» è obbligatorio.",
            ),
            (
                "/api/generate-from-link",
                {"url": "ftp://example.com"},
                "Il link indicato non è un indirizzo valido: controlla che inizi "
                "con http:// o https://.",
            ),
            (
                "/api/summarize",
                {"text": VALID_TEXT, "length": "lunghissimo"},
                "Il valore indicato per «lunghezza» non è fra quelli "
                "ammessi: scegline uno fra le opzioni proposte.",
            ),
        ],
    )
    def test_messaggio_indica_causa_e_azione_correttiva(
        self, client: TestClient, path: str, payload: dict, atteso: str
    ) -> None:
        """R-110-F-Ob: linguaggio naturale, causa e rimedio."""
        response = client.post(path, json=payload)

        assert response.status_code == 422
        assert response.json()["detail"] == atteso

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param({"text": VALID_TEXT, "length": 999}, id="length-intero"),
            pytest.param({"text": VALID_TEXT, "length": None}, id="length-nullo"),
            pytest.param({"text": 12345}, id="text-intero"),
            pytest.param({"text": VALID_TEXT, "length": []}, id="length-lista"),
        ],
    )
    def test_detail_resta_stringa_anche_col_tipo_di_dato_sbagliato(
        self, client: TestClient, payload: dict
    ) -> None:
        """Un tipo sbagliato non deve far ricomparire l'array di oggetti.

        E' il caso che rompeva il frontend: `useAiStream` legge `detail` come
        `string | null` e lo mette nello store. Un array la' dentro non e' un
        messaggio piu' brutto, e' un crash in fase di render.
        """
        response = client.post("/api/summarize", json=payload)

        assert response.status_code == 422
        assert isinstance(response.json()["detail"], str)

    def test_piu_campi_invalidi_producono_un_unico_messaggio(
        self, client: TestClient
    ) -> None:
        response = client.post(
            "/api/translate", json={"text": "corto", "target_language": "it"}
        )

        detail = response.json()["detail"]
        assert isinstance(detail, str)
        assert "«testo»" in detail
        assert "«lingua di destinazione»" in detail

    def test_corpo_non_json_produce_un_messaggio_leggibile(
        self, client: TestClient
    ) -> None:
        response = client.post(
            "/api/summarize",
            content=b"{non e json",
            headers={"content-type": "application/json"},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Il corpo della richiesta non è in formato JSON valido."
        )

    def test_il_contratto_dichiara_error_response_per_il_422(self) -> None:
        """Comportamento e contratto vanno cambiati insieme.

        Se lo schema restasse HTTPValidationError, openapi.json descriverebbe
        una forma che l'applicazione non produce piu' e `pnpm types:gen`
        genererebbe tipi sbagliati.
        """
        schema = app.openapi()

        for path in (
            "/api/summarize",
            "/api/generate",
            "/api/generate-from-link",
            "/api/translate",
            "/api/rewrite",
            "/api/grammar",
            "/api/critique",
        ):
            risposta = schema["paths"][path]["post"]["responses"]["422"]
            riferimento = risposta["content"]["application/json"]["schema"]["$ref"]
            assert riferimento == "#/components/schemas/ErrorResponse"

        assert "HTTPValidationError" not in schema["components"]["schemas"]
