"""Test del provider `get_content_extractor` e dell'iniezione nella rotta.

Due proprieta' distinte, che prima erano intrecciate nella stessa riga
`extractor = TavilyExtractor()` dentro la rotta:

1. chi decide quale implementazione usare e' il provider, non la rotta;
2. una chiave assente e' un servizio indisponibile (503), non un errore di
   programmazione (500).
"""

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.ports.content_extractor import ContentExtractor
from app.infrastructure.adapters.tavily_extractor import TavilyExtractor
from app.llm import _CHIAVE_MANCANTE_DETAIL, get_content_extractor
from app.settings import get_settings


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
        """L'unica sorgente della chiave e' l'argomento passato.

        Prima il costruttore leggeva `get_settings()`: con l'ambiente vuoto
        falliva, e per istanziarlo in un test bisognava alterare l'ambiente.
        """
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
