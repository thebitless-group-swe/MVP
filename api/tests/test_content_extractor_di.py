"""Test del provider `get_content_extractor` e dell'iniezione nella rotta."""

import logging
from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.routes.generate_link import _FETCH_FAILED_DETAIL
from app.core.ports.content_extractor import ContentExtractor
from app.dependencies import (
    _CHIAVE_MANCANTE_DETAIL,
    get_content_extractor,
    get_llm_client,
    get_settings,
)
from app.infrastructure.adapters.tavily_extractor import TavilyExtractor
from app.main import app
from tests.conftest import DummyLLMClient


@pytest.fixture(autouse=True)
def _pulisci_le_cache() -> Iterator[None]:
    """Sia `get_settings` sia `get_content_extractor` sono `@lru_cache`.

    Senza questa pulizia un estrattore costruito con la chiave finta di un
    test resterebbe in cache per tutti i successivi, e i test passerebbero o
    fallirebbero a seconda dell'ordine di esecuzione.
    """
    get_settings.cache_clear()
    get_content_extractor.cache_clear()
    yield
    get_settings.cache_clear()
    get_content_extractor.cache_clear()


class TestProvider:
    def test_senza_chiave_solleva_503_e_non_un_errore_generico(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TAVILY_API_KEY", "")

        with pytest.raises(HTTPException) as exc_info:
            get_content_extractor()

        assert exc_info.value.status_code == 503

    def test_con_la_chiave_restituisce_qualcosa_che_rispetta_la_porta(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """La rotta dipende da `ContentExtractor`: e' questo che va garantito."""
        monkeypatch.setenv("TAVILY_API_KEY", "tvly-chiave-finta")

        estrattore = get_content_extractor()

        assert isinstance(estrattore, ContentExtractor)

    def test_costruisce_l_adattatore_una_volta_sola(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """`@lru_cache`: il client Tavily non va ricreato a ogni richiesta."""
        monkeypatch.setenv("TAVILY_API_KEY", "tvly-chiave-finta")

        assert get_content_extractor() is get_content_extractor()


class TestAdattatoreDisaccoppiatoDaiSettings:
    """`TavilyExtractor` non deve piu' sapere che esistono i settings globali."""

    def test_la_chiave_e_un_parametro_obbligatorio(self) -> None:
        with pytest.raises(TypeError):
            TavilyExtractor()  # type: ignore[call-arg]

    def test_si_costruisce_anche_senza_chiave_nell_ambiente(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """L'unica sorgente della chiave e' l'argomento passato."""
        monkeypatch.setenv("TAVILY_API_KEY", "")
        get_settings.cache_clear()

        estrattore = TavilyExtractor(api_key="chiave-passata-a-mano")

        assert isinstance(estrattore, ContentExtractor)

    def test_il_modulo_non_importa_piu_get_settings(self) -> None:
        """Il disaccoppiamento e' strutturale, non solo di comportamento."""
        from app.infrastructure.adapters import tavily_extractor

        assert not hasattr(tavily_extractor, "get_settings")


class TestRottaSenzaChiave:
    def test_risponde_503_invece_di_500(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Il difetto originale: la rotta restituiva 500 su chiave mancante."""
        monkeypatch.setenv("TAVILY_API_KEY", "")

        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )

        assert response.status_code == 503

    def test_il_corpo_ha_la_forma_di_ogni_altro_errore(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TAVILY_API_KEY", "")

        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )

        assert response.json() == {"detail": _CHIAVE_MANCANTE_DETAIL}

    def test_non_espone_dettagli_interni(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TAVILY_API_KEY", "")

        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )

        for tecnicismo in ("Tavily", "Traceback", "ContentExtractorError", "tvly-"):
            assert tecnicismo not in response.text


@pytest.fixture
def rotta_con_estrazione_fallita(
    failing_content_extractor: ContentExtractor,
    dummy_llm_client: DummyLLMClient,
) -> Iterator[None]:
    """Inietta un estrattore che solleva sempre `ContentExtractorError`.

    L'override e' un callable, non l'istanza: FastAPI chiama cio' che trova in
    `dependency_overrides`, quindi passare l'oggetto nudo lo renderebbe la
    dipendenza stessa solo per caso, e romperebbe appena la fixture cambiasse
    forma.

    Si rimuove la sola chiave iniettata invece di `clear()`: la fixture
    `content_extractor_override` di conftest usa la stessa forma, e cosi' due
    override non si cancellano a vicenda quando un test li combina.

    Anche `get_llm_client` viene sostituito, benche' questi test non arrivino
    mai a usare il client: l'estrazione fallisce prima. FastAPI pero' risolve
    *tutte* le dipendenze prima del corpo, quindi il vero provider verrebbe
    invocato lo stesso. Oggi regge perche' `LiteLLMClient` si costruisce anche
    con l'ambiente vuoto; il giorno in cui prendesse la guardia 503 della #07,
    questi quattro test fallirebbero per l'inversione fra dipendenza e corpo —
    e con due 503 diversi in gioco la diagnosi costerebbe molto piu' di questa
    riga.
    """
    app.dependency_overrides[get_content_extractor] = lambda: failing_content_extractor
    app.dependency_overrides[get_llm_client] = lambda: dummy_llm_client
    yield
    app.dependency_overrides.pop(get_content_extractor, None)
    app.dependency_overrides.pop(get_llm_client, None)


@pytest.mark.usefixtures("rotta_con_estrazione_fallita")
class TestRottaConEstrazioneFallita:
    """Il secondo percorso 503 della rotta: la chiave c'e', l'estrazione no.

    Asserire `status_code == 503` e basta non basterebbe: anche il caso della
    chiave mancante risponde 503, quindi un test cosi' passerebbe pure se la
    richiesta fallisse per il motivo sbagliato. E' il `detail` a distinguere i
    due percorsi, ed e' su quello che questi test si appoggiano.
    """

    def test_risponde_503_con_il_detail_dell_estrazione_fallita(
        self, client: TestClient
    ) -> None:
        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )

        assert response.status_code == 503
        assert response.json() == {"detail": _FETCH_FAILED_DETAIL}

    def test_non_e_il_503_della_chiave_mancante(self, client: TestClient) -> None:
        """Guardia esplicita contro il falso positivo descritto sopra."""
        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )

        assert response.json()["detail"] != _CHIAVE_MANCANTE_DETAIL

    def test_la_causa_arriva_al_log_con_lo_stacktrace(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Lato server il dettaglio deve esserci tutto: e' li' che si debugga."""
        with caplog.at_level(logging.ERROR, logger="app.api.routes.generate_link"):
            client.post(
                "/api/generate-from-link", json={"url": "https://example.com"}
            )

        assert any(
            "Estrazione contenuto fallita" in record.message
            for record in caplog.records
        ), "la rotta non ha registrato il fallimento dell'estrazione"
        assert any(record.exc_info is not None for record in caplog.records), (
            "logger.exception non ha allegato lo stacktrace"
        )

    def test_la_causa_non_arriva_al_client(self, client: TestClient) -> None:
        """Il messaggio dell'eccezione interna non deve uscire nel corpo."""
        response = client.post(
            "/api/generate-from-link", json={"url": "https://example.com"}
        )

        for tecnicismo in (
            "Errore simulato",
            "ContentExtractorError",
            "FetchError",
            "Traceback",
            "Tavily",
        ):
            assert tecnicismo not in response.text
