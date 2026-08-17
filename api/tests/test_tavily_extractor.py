"""Test dell'adattatore Tavily."""

import asyncio
import contextlib
import threading
import time
from unittest.mock import MagicMock

import pytest

from app.core.ports.content_extractor import ContentExtractorError
from app.infrastructure.adapters.tavily_extractor import MAX_CHARS, TavilyExtractor

API_KEY = "chiave-di-test"

#Prefisso dei soli errori sollevati dal blocco `try` attorno alla chiamata a
#Tavily. I due errori di contenuto vuoto nascono dopo, fuori dal `try`: se un
#giorno finissero dentro, lo si vedrebbe da questo prefisso comparire nel loro
#messaggio, ed e' quello che le asserzioni qui sotto sorvegliano.
PREFISSO_ERRORE_CLIENT = "Errore durante l'estrazione:"


def test_il_costruttore_senza_chiave_rifiuta_di_costruire_l_adattatore() -> None:
    """La guardia della riga 19 e' difesa in profondita', non il percorso normale."""
    with pytest.raises(ContentExtractorError) as exc_info:
        TavilyExtractor(api_key="")

    #Il messaggio nomina la variabile d'ambiente: e' cio' che rende l'errore
    #azionabile da chi fa il deploy senza leggere il sorgente.
    assert "TAVILY_API_KEY" in str(exc_info.value)


def make_extractor(response: dict) -> TavilyExtractor:
    """TavilyExtractor con client finto: nessuna richiesta esce in rete."""
    extractor = TavilyExtractor(api_key=API_KEY)
    extractor._client = MagicMock()
    extractor._client.extract.return_value = response
    return extractor


def make_extractor_guasto(errore: Exception) -> TavilyExtractor:
    """TavilyExtractor il cui client solleva invece di rispondere."""
    extractor = TavilyExtractor(api_key=API_KEY)
    extractor._client = MagicMock()
    extractor._client.extract.side_effect = errore
    return extractor


async def test_estrazione_riuscita_restituisce_il_raw_content_invariato() -> None:
    """Il percorso felice, asserito per quello che e'."""
    pagina = "# Titolo\n\nCorpo della pagina estratta."
    extractor = make_extractor({"results": [{"raw_content": pagina}]})

    result = await extractor.extract("https://example.com")

    assert result == pagina


async def test_aclose_chiude_la_sessione_del_client() -> None:
    """La delega, asserita dove e' osservabile: su un doppio."""
    extractor = make_extractor({"results": [{"raw_content": "x"}]})

    await extractor.aclose()

    extractor._client.close.assert_called_once_with()


async def test_risultati_vuoti_segnalano_una_pagina_inesistente_o_vuota() -> None:
    """Asserire il tipo non basterebbe: da `extract` escono tre errori uguali."""
    extractor = make_extractor({"results": []})

    with pytest.raises(ContentExtractorError) as exc_info:
        await extractor.extract("https://example.com")

    messaggio = str(exc_info.value)
    assert "non esistere o essere vuota" in messaggio
    assert not messaggio.startswith(PREFISSO_ERRORE_CLIENT)


@pytest.mark.parametrize(
    ("primo_risultato", "caso"),
    [
        ({"raw_content": ""}, "campo presente ma vuoto"),
        ({}, "campo del tutto assente"),
    ],
)
async def test_raw_content_assente_o_vuoto_segnala_una_pagina_senza_testo(
    primo_risultato: dict, caso: str
) -> None:
    """Due forme diverse della stessa risposta, e Tavily le produce entrambe."""
    extractor = make_extractor({"results": [primo_risultato]})

    with pytest.raises(ContentExtractorError) as exc_info:
        await extractor.extract("https://example.com")

    messaggio = str(exc_info.value)
    assert "non contiene testo" in messaggio, caso
    assert not messaggio.startswith(PREFISSO_ERRORE_CLIENT), caso


async def test_un_errore_del_client_diventa_un_errore_di_porta() -> None:
    """E' il confine dell'esagono: fuori di qui nessuno conosce Tavily."""
    guasto = ConnectionError("connessione rifiutata dall'host")
    extractor = make_extractor_guasto(guasto)

    with pytest.raises(ContentExtractorError) as exc_info:
        await extractor.extract("https://example.com")

    assert str(exc_info.value).startswith(PREFISSO_ERRORE_CLIENT)
    assert "connessione rifiutata dall'host" in str(exc_info.value)
    assert exc_info.value.__cause__ is guasto


async def test_extract_truncates_content_longer_than_max_chars() -> None:
    long_content = "a" * (MAX_CHARS + 8_000)
    extractor = make_extractor({"results": [{"raw_content": long_content}]})

    result = await extractor.extract("https://example.com")

    assert len(result) == MAX_CHARS


class ClientLento:
    """Doppio sincrono e lento, come la vera API Tavily.

    Il ritardo e' `time.sleep`, non `asyncio.sleep`: e' proprio una funzione
    bloccante quella che deve finire su un altro thread. Con `asyncio.sleep` il
    test passerebbe anche senza `to_thread` e non proverebbe nulla.
    """

    RITARDO = 0.3

    def __init__(self, ritardo: float | None = None) -> None:
        self._ritardo = self.RITARDO if ritardo is None else ritardo
        self.thread_usati: list[int] = []
        self.chiamate: list[dict] = []

    def extract(self, **kwargs: object) -> dict:
        self.thread_usati.append(threading.get_ident())
        self.chiamate.append(kwargs)
        time.sleep(self._ritardo)
        return {"results": [{"raw_content": "contenuto"}]}


def make_extractor_lento(client: ClientLento) -> TavilyExtractor:
    extractor = TavilyExtractor(api_key=API_KEY)
    extractor._client = client
    return extractor


async def test_la_chiamata_sincrona_non_gira_sul_thread_dell_event_loop() -> None:
    """Verifica deterministica di `to_thread`, senza dipendere dai tempi."""
    client = ClientLento(ritardo=0)
    extractor = make_extractor_lento(client)
    thread_del_loop = threading.get_ident()

    await extractor.extract("https://example.com")

    assert len(client.thread_usati) == 1
    assert client.thread_usati[0] != thread_del_loop


async def test_due_estrazioni_concorrenti_non_bloccano_l_event_loop() -> None:
    """Due estrazioni insieme devono sovrapporsi, e il loop restare vivo."""
    client = ClientLento()
    extractor = make_extractor_lento(client)

    battiti = 0

    async def cuore() -> None:
        nonlocal battiti
        while True:
            await asyncio.sleep(0.01)
            battiti += 1

    pulsazione = asyncio.create_task(cuore())
    inizio = time.perf_counter()

    risultati = await asyncio.gather(
        extractor.extract("https://example.com/uno"),
        extractor.extract("https://example.com/due"),
    )

    durata = time.perf_counter() - inizio
    pulsazione.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await pulsazione

    assert risultati == ["contenuto", "contenuto"]
    #In sequenza il tempo sarebbe 2 * RITARDO, in parallelo circa RITARDO. La
    #soglia sta in mezzo: non a 2 * RITARDO, dove il caso bloccante la sfiorava
    #(0.601 contro 0.6) e bastava un runner lento per farla passare comunque.
    assert durata < ClientLento.RITARDO * 1.5
    #Ogni battito e' un giro di event loop avvenuto durante l'attesa di rete.
    assert battiti > 0
    #Due thread distinti: le due estrazioni non si sono messe in coda fra loro.
    assert len(set(client.thread_usati)) == 2


async def test_to_thread_inoltra_gli_argomenti_attesi_a_tavily() -> None:
    """Il passaggio a `to_thread` non deve cambiare il contratto verso Tavily."""
    client = ClientLento(ritardo=0)
    extractor = make_extractor_lento(client)

    await extractor.extract("https://example.com/pagina")

    assert client.chiamate == [
        {
            "urls": "https://example.com/pagina",
            "extract_depth": "basic",
            "format": "text",
        }
    ]
