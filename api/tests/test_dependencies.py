"""Test del composition root.

Verifica le due proprieta' che rendono `dependencies.py` utile invece che solo
ordinato: che ogni dipendenza sia sostituibile in un test, e che il vecchio
punto di composizione non sia sopravvissuto come alias.

Le tre dipendenze sono sostituibili, ma non dallo stesso meccanismo, e questi
test rispecchiano l'asimmetria invece di nasconderla. `get_llm_client` e
`get_content_extractor` sono dichiarate con `Depends` nelle rotte, quindi
FastAPI le risolve passando da `dependency_overrides`. `get_settings` no:
nessuna rotta la inietta — la chiamano `main.py` e gli altri due provider — e si
controlla con l'ambiente piu' `cache_clear()`. Un test che la infilasse in
`dependency_overrides` passerebbe senza verificare niente, perche' quell'entrata
non verrebbe mai consultata: sarebbe un test verde su un meccanismo inattivo.
"""
import importlib
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.dependencies import (
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
