"""Test dell'adattatore Tavily.

Il servizio Tavily non viene mai contattato: l'adattatore e' costruito con una
chiave fittizia e il collaboratore privato `_client` e' sostituito da un doppio.
E' il precedente gia' adottato in test_llm_client.py::make_client, ed e' una
scelta consapevole: mockare la classe `TavilyClient` neutralizzerebbe anche il
costruttore dell'adattatore, che deve invece restare eseguibile e testabile.

Il doppio e' un MagicMock e non un AsyncMock perche' `_client.extract` e' una
API sincrona: un AsyncMock restituirebbe una coroutine e la successiva
`response.get(...)` fallirebbe per un motivo estraneo a cio' che il test verifica.
"""

import asyncio
import contextlib
import threading
import time
from unittest.mock import MagicMock

from app.infrastructure.adapters.tavily_extractor import MAX_CHARS, TavilyExtractor

API_KEY = "chiave-di-test"


def make_extractor(response: dict) -> TavilyExtractor:
    """TavilyExtractor con client finto: nessuna richiesta esce in rete."""
    extractor = TavilyExtractor(api_key=API_KEY)
    extractor._client = MagicMock()
    extractor._client.extract.return_value = response
    return extractor


# Contenuto oltre il cap → l'adattatore lo tronca a MAX_CHARS
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
    """Verifica deterministica di `to_thread`, senza dipendere dai tempi.

    Se `extract` tornasse a essere invocato direttamente, il client verrebbe
    eseguito sullo stesso thread del loop e questo confronto fallirebbe.
    """
    client = ClientLento(ritardo=0)
    extractor = make_extractor_lento(client)
    thread_del_loop = threading.get_ident()

    await extractor.extract("https://example.com")

    assert len(client.thread_usati) == 1
    assert client.thread_usati[0] != thread_del_loop


async def test_due_estrazioni_concorrenti_non_bloccano_l_event_loop() -> None:
    """Due estrazioni insieme devono sovrapporsi, e il loop restare vivo.

    Il battito e' la parte che conta: misura cio' che il bug causava davvero,
    cioe' un'API ferma per tutti mentre una sola richiesta aspetta la rete.
    Con la chiamata bloccante non girerebbe nemmeno una volta.
    """
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
