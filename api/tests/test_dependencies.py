"""Test del composition root."""
import importlib
from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.dependencies import (
    close_llm_client,
    get_content_extractor,
    get_llm_client,
    get_settings,
)
from app.main import app
from tests.conftest import DummyContentExtractor, DummyLLMClient

TESTO = "Un testo abbastanza lungo da superare la validazione di schema."


@pytest.fixture
def _pulisci_le_cache() -> Iterator[None]:
    """`get_settings` e `get_content_extractor` sono `@lru_cache`.

    Senza questa pulizia il valore costruito con l'ambiente di un test
    resterebbe in cache per tutti i successivi.
    """
    get_settings.cache_clear()
    get_content_extractor.cache_clear()
    yield
    get_settings.cache_clear()
    get_content_extractor.cache_clear()


class TestDipendenzeIniettateViaDepends:
    """Le due porte: le rotte le dichiarano con `Depends`, i test le sostituiscono."""

    def test_l_override_del_client_llm_viene_usato(self, client: TestClient) -> None:
        #`lambda: DummyLLMClient()` e non `DummyLLMClient`: FastAPI ispeziona la
        #firma di cio' che trova in `dependency_overrides` per dedurne le
        #sotto-dipendenze, quindi passare la classe le farebbe leggere il
        #parametro `chunks` del costruttore come un campo della richiesta — e la
        #rotta risponderebbe 422 invece di usare il doppio.
        app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient()
        try:
            response = client.post(
                "/api/summarize", json={"text": TESTO, "length": "medio"}
            )
        finally:
            app.dependency_overrides.pop(get_llm_client, None)

        assert response.status_code == 200
        #I chunk del doppio arrivano fino al corpo SSE: l'override e' stato
        #davvero consultato, non solo registrato.
        for chunk in DummyLLMClient.DEFAULT_CHUNKS:
            assert chunk.strip() in response.text

    def test_l_override_dell_estrattore_viene_usato(self, client: TestClient) -> None:
        #Sulla forma dell'override vedi il commento nel test precedente.
        app.dependency_overrides[get_content_extractor] = lambda: DummyContentExtractor()
        app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient()
        try:
            response = client.post(
                "/api/generate-from-link", json={"url": "https://example.com"}
            )
        finally:
            app.dependency_overrides.pop(get_content_extractor, None)
            app.dependency_overrides.pop(get_llm_client, None)

        #Senza override questa rotta risponde 503 in un ambiente senza
        #TAVILY_API_KEY: il 200 e' esso stesso la prova che il doppio ha preso
        #il posto dell'adattatore vero.
        assert response.status_code == 200


@pytest.mark.usefixtures("_pulisci_le_cache")
class TestConfigurazione:
    """`get_settings` non passa da `Depends`: si sostituisce dall'ambiente."""

    def test_l_ambiente_sostituisce_la_configurazione(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LITELLM_MODEL", "modello-di-prova")

        assert get_settings().litellm_model == "modello-di-prova"

    def test_senza_cache_clear_il_valore_precedente_sopravvivrebbe(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Il motivo per cui la fixture di pulizia esiste, reso esplicito."""
        monkeypatch.setenv("LITELLM_MODEL", "primo")
        primo = get_settings()

        monkeypatch.setenv("LITELLM_MODEL", "secondo")

        assert get_settings() is primo
        get_settings.cache_clear()
        assert get_settings().litellm_model == "secondo"


class TestIlVecchioPuntoDiComposizioneNonEsistePiu:
    """`app/llm/` non esiste piu': nessun package prende nome da una tecnologia.

    La #18 aveva svuotato il package dei provider e lasciato dentro il solo
    `prompts.py`, con un canarino che sorvegliava quello stato provvisorio; il
    suo docstring diceva di eliminarlo quando i prompt fossero stati promossi
    dentro `core/`. E' successo, e il canarino se n'e' andato con lui.

    Quel che resta e' l'asserzione piu' forte: non che `app.llm` non esponga
    piu' i provider, ma che non esista affatto. Finche' fosse importabile,
    «il composition root e' unico» sarebbe vero per convenzione e non per
    costruzione.
    """

    def test_app_llm_non_e_piu_importabile(self) -> None:
        with pytest.raises(ModuleNotFoundError):
            importlib.import_module("app.llm")

    def test_i_prompt_vivono_nel_dominio(self) -> None:
        from app.core.domain.prompts.templates import build_summarize_messages

        assert callable(build_summarize_messages)


class TestIDueProviderSiComportanoAllostessoModo:
    """Davanti a una chiave assente i due provider rispondevano in modo opposto.

    `get_content_extractor` sollevava 503 — una configurazione incompleta e' un
    servizio indisponibile — mentre `get_llm_client` non aveva alcuna guardia e
    il fallimento arrivava a runtime come 500, cioe' come errore di
    programmazione. Nulla giustificava la differenza: e' lo stesso tipo di
    guasto sulla stessa classe di configurazione.

    Le guardie restano anche ora che il boot e' presidiato: in un processo
    avviato regolarmente non possono scattare, ma l'app e' costruibile senza
    lifespan — `export_openapi` lo fa, e i test lo fanno di continuo.
    """

    @pytest.fixture(autouse=True)
    def _cache_pulita(self) -> Iterator[None]:
        for provider in (get_settings, get_llm_client, get_content_extractor):
            provider.cache_clear()
        yield
        for provider in (get_settings, get_llm_client, get_content_extractor):
            provider.cache_clear()

    @pytest.mark.parametrize(
        ("variabile", "provider"),
        [
            ("LITELLM_API_KEY", get_llm_client),
            ("TAVILY_API_KEY", get_content_extractor),
        ],
    )
    def test_chiave_assente_produce_503_e_non_500(
        self,
        monkeypatch: pytest.MonkeyPatch,
        variabile: str,
        provider: object,
    ) -> None:
        monkeypatch.setenv(variabile, "")
        get_settings.cache_clear()

        with pytest.raises(HTTPException) as errore:
            provider()  # type: ignore[operator]

        assert errore.value.status_code == 503

    @pytest.mark.parametrize(
        ("variabile", "provider"),
        [
            ("LITELLM_API_KEY", get_llm_client),
            ("TAVILY_API_KEY", get_content_extractor),
        ],
    )
    def test_il_detail_non_espone_dettagli_interni(
        self,
        monkeypatch: pytest.MonkeyPatch,
        variabile: str,
        provider: object,
    ) -> None:
        """R-110-F-Ob: causa e azione, senza tecnicismi."""
        monkeypatch.setenv(variabile, "")
        get_settings.cache_clear()

        with pytest.raises(HTTPException) as errore:
            provider()  # type: ignore[operator]

        detail = str(errore.value.detail)
        assert isinstance(errore.value.detail, str)
        for tecnicismo in (variabile, "Traceback", "LiteLLM", "Tavily", "sk-", "tvly-"):
            assert tecnicismo not in detail


class TestChiusuraSenzaChiave:
    """La trappola che la guardia su `get_llm_client` avrebbe potuto aprire.

    `close_llm_client` chiamava il provider incondizionatamente. Con la guardia
    aggiunta, quella chiamata a cache vuota e senza chiave solleverebbe 503
    facendo fallire l'uscita del processo in ogni ambiente non configurato.
    E' lo stesso difetto che `close_content_extractor` gia' evitava, e il
    rimedio e' lo stesso: interrogare la cache invece del provider.
    """

    @pytest.fixture(autouse=True)
    def _cache_pulita(self) -> Iterator[None]:
        for provider in (get_settings, get_llm_client, get_content_extractor):
            provider.cache_clear()
        yield
        for provider in (get_settings, get_llm_client, get_content_extractor):
            provider.cache_clear()

    @pytest.mark.asyncio
    async def test_close_llm_client_senza_chiave_non_solleva(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LITELLM_API_KEY", "")
        get_settings.cache_clear()

        await close_llm_client()

        #Nessun client fabbricato solo per chiuderlo.
        assert get_llm_client.cache_info().currsize == 0
