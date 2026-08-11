"""Test del lifespan: rilascio delle risorse allo shutdown dell'applicazione.

File dedicato, e non un'aggiunta a test_health.py, per una ragione che non e' di
stile: questi sono i primi test del repository a scrivere `with TestClient(app)`,
cioe' gli unici che eseguono davvero il lifespan. Sono percio' esattamente quelli
che una futura validazione delle chiavi al boot farebbe fallire. Tenerli in un
file solo confina il raggio di quella modifica, invece di spargerlo sulla fixture
`client` condivisa da tutta la suite.

Diversi test leggono `_client`, l'attributo privato dell'adattatore. E' il
precedente gia' adottato in test_tavily_extractor.py: la risorsa da chiudere e'
incapsulata per costruzione, e verificarne la chiusura richiede di guardarci.
"""

import logging
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_content_extractor, get_llm_client, get_settings
from app.main import app


@pytest.fixture(autouse=True)
def _pulisci_le_cache() -> Iterator[None]:
    """Questi test chiudono i singleton veri: senza pulizia li lascerebbero cosi'.

    `get_llm_client` e `get_content_extractor` sono `@lru_cache`, quindi
    l'istanza chiusa qui sarebbe la stessa che riceverebbe qualunque test
    successivo, e la suite passerebbe o fallirebbe a seconda dell'ordine di
    esecuzione. Stesso precedente di test_content_extractor_di.py.
    """
    for provider in (get_settings, get_llm_client, get_content_extractor):
        provider.cache_clear()
    yield
    for provider in (get_settings, get_llm_client, get_content_extractor):
        provider.cache_clear()


class TestIlLifespanGiraSoloConIlContextManager:
    """L'invariante su cui poggia il resto della suite."""

    def test_senza_context_manager_il_lifespan_non_gira(self) -> None:
        """`conftest.client` usa `TestClient(app)` nudo, e nessun altro test usa `with`.

        Se il lifespan girasse comunque, ogni test della suite uscirebbe
        chiudendo il client LLM condiviso. Fissare qui l'invariante fa si' che
        un cambio di comportamento di Starlette si scopra in questo punto,
        invece che come una manciata di fallimenti sparsi e senza causa
        evidente altrove.
        """
        llm = get_llm_client()

        nudo = TestClient(app)
        nudo.get("/")

        assert not llm._client.is_closed


class TestChiusuraDelClientLLM:
    def test_lo_shutdown_invoca_aclose(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """`aclose` esisteva da sempre e non era invocato da nessuna parte."""
        llm = get_llm_client()
        invocazioni: list[str] = []
        originale = llm.aclose

        async def spia() -> None:
            invocazioni.append("aclose")
            #Si delega all'originale invece di sostituirlo: la risorsa va chiusa
            #davvero, altrimenti il test introdurrebbe la perdita che sorveglia.
            await originale()

        monkeypatch.setattr(llm, "aclose", spia)

        with TestClient(app):
            pass

        assert invocazioni == ["aclose"]

    def test_dopo_lo_shutdown_il_client_httpx_e_davvero_chiuso(self) -> None:
        """Asserisce l'effetto, non la chiamata.

        Il test precedente verifica che il lifespan passi per `aclose`; questo
        che `aclose` faccia qualcosa. Un `aclose` svuotato passerebbe quello e
        fallirebbe questo: servono entrambi.
        """
        llm = get_llm_client()

        with TestClient(app) as attivo:
            attivo.get("/")
            assert not llm._client.is_closed

        assert llm._client.is_closed


class TestChiusuraDellAdattatoreTavily:
    def test_senza_chiave_lo_shutdown_non_solleva(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """La trappola che `close_content_extractor` esiste per evitare.

        Chiamare `get_content_extractor()` allo shutdown avrebbe sollevato
        `HTTPException(503)` in ogni ambiente senza chiave — i test per primi.
        Nessuna richiesta HTTP attraversa questo percorso, quindi senza un test
        dedicato il difetto si manifesterebbe solo alla chiusura di un processo
        reale, cioe' dove nessuno lo sta guardando.
        """
        monkeypatch.setenv("TAVILY_API_KEY", "")
        get_settings.cache_clear()

        with TestClient(app) as attivo:
            attivo.get("/")

        #Nessun adattatore in cache: non se ne fabbrica uno solo per chiuderlo.
        assert get_content_extractor.cache_info().currsize == 0

    def test_con_la_chiave_lo_shutdown_chiude_l_adattatore(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Qui si asserisce la chiamata, e va detto perche' non l'effetto.

        `httpx.AsyncClient` espone `is_closed`, quindi per l'LLM l'effetto e'
        osservabile e il test qui sopra lo sfrutta. `requests.Session` non ha un
        equivalente: verificato che dopo `close()` non resta alcuno stato
        pubblico diverso da prima — nessun `is_closed`, `adapters` invariati.
        L'unico effetto davvero osservabile sarebbe `poolmanager.pools` svuotato,
        che e' un interno di `urllib3` e legherebbe il test a una dipendenza
        transitiva. Si asserisce quindi il cablaggio, dichiarandolo piu' debole
        del suo gemello; la delega verso `TavilyClient.close` e' invece
        verificabile con un doppio, ed e' coperta in test_tavily_extractor.py.
        """
        monkeypatch.setenv("TAVILY_API_KEY", "tvly-chiave-finta")
        get_settings.cache_clear()

        extractor = get_content_extractor()
        invocazioni: list[str] = []
        originale = extractor.aclose

        async def spia() -> None:
            invocazioni.append("aclose")
            await originale()

        monkeypatch.setattr(extractor, "aclose", spia)

        with TestClient(app):
            pass

        assert invocazioni == ["aclose"]


class TestValidazioneDelleChiaviAlBoot:
    """Una chiave mancante si scopre dal log di avvio, non dal primo utente.

    Questi test stanno qui e non in un file proprio per la stessa ragione per
    cui ci sta il resto: `with TestClient(app)` esegue il lifespan, e la suite
    tiene tutte le sue occorrenze in un file solo. Spargerle significherebbe
    che una modifica al lifespan rompe test sparsi senza causa evidente.
    """

    def test_senza_litellm_il_processo_non_parte(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Senza LITELLM_API_KEY nessuna delle sette funzioni AI puo' servire.

        Un'API che accetta richieste sapendo di non poterne soddisfare nessuna
        sta rispondendo a una domanda che non avrebbe dovuto ricevere.
        """
        monkeypatch.setenv("LITELLM_API_KEY", "")
        get_settings.cache_clear()

        with pytest.raises(RuntimeError):
            with TestClient(app):
                pass

    def test_il_messaggio_nomina_la_variabile_mancante(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Il destinatario e' chi fa il deploy, non l'utente.

        E' l'opposto di R-110-F-Ob, che vieta i dettagli tecnici nelle risposte
        HTTP: li' il nome di una variabile d'ambiente sarebbe rumore o rischio,
        qui e' l'unica informazione che rende l'errore azionabile.
        """
        monkeypatch.setenv("LITELLM_API_KEY", "")
        get_settings.cache_clear()

        with pytest.raises(RuntimeError) as errore:
            with TestClient(app):
                pass

        assert "LITELLM_API_KEY" in str(errore.value)

    def test_il_fallimento_finisce_nel_log(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Sollevare non basta: la DoD chiede che «il log dica quale manca».

        Chi fa il deploy legge il log del container, non lo stacktrace.
        """
        monkeypatch.setenv("LITELLM_API_KEY", "")
        get_settings.cache_clear()

        with caplog.at_level(logging.ERROR, logger="app.dependencies"):
            with pytest.raises(RuntimeError):
                with TestClient(app):
                    pass

        assert any("LITELLM_API_KEY" in record.message for record in caplog.records)

    def test_senza_tavily_il_processo_parte_lo_stesso(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """La degradazione graduale e' una decisione, e va fissata da un test.

        TAVILY_API_KEY serve al solo /api/generate-from-link: la sua assenza
        toglie un endpoint su otto, non il prodotto. Per quel caso la risposta
        proporzionata resta il 503 per richiesta, coperto da
        test_content_extractor_di.py. Se un domani si decidesse di renderla
        obbligatoria, e' questa asserzione a doversi rompere — invece che la
        scelta a cambiare in silenzio.
        """
        monkeypatch.setenv("TAVILY_API_KEY", "")
        get_settings.cache_clear()

        with TestClient(app) as attivo:
            assert attivo.get("/").status_code == 200
