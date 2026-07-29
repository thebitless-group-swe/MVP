"""Test del global exception handler per HTTPException.

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
