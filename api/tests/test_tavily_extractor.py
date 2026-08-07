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
    """La guardia della riga 19 e' difesa in profondita', non il percorso normale.

    Attraverso `get_content_extractor` non si arriva mai qui: il provider
    controlla la chiave per primo e risponde 503. Questa guardia serve a chi
    costruisce l'adattatore altrove — un secondo composition root, uno script —
    e senza di essa otterrebbe un `TavilyClient` costruito su una chiave vuota,
    che fallisce molto piu' tardi e per un motivo che non nomina la causa.
    """
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


# Estrazione riuscita → l'adattatore restituisce il raw_content, invariato
async def test_estrazione_riuscita_restituisce_il_raw_content_invariato() -> None:
    """Il percorso felice, asserito per quello che e'.

    I test su `to_thread` piu' sotto attraversano gia' questa riga, ma lo fanno
    di striscio: verificano dove gira la chiamata, non che cosa torna. Un
    troncamento sbagliato o un `raw_content` scambiato con un altro campo li
    lascerebbe verdi tutti quanti.
    """
    pagina = "# Titolo\n\nCorpo della pagina estratta."
    extractor = make_extractor({"results": [{"raw_content": pagina}]})

    result = await extractor.extract("https://example.com")

    assert result == pagina


# Nessun risultato → pagina inesistente o vuota
async def test_risultati_vuoti_segnalano_una_pagina_inesistente_o_vuota() -> None:
    """Asserire il tipo non basterebbe: da `extract` escono tre errori uguali.

    `ContentExtractorError` e' l'unico tipo che questo metodo solleva, quindi
    un test sul solo tipo passerebbe anche se la pagina vuota finisse a
    segnalare il guasto del client. E' il messaggio a distinguere le tre cause,
    ed e' sul messaggio che il test si appoggia.
    """
    extractor = make_extractor({"results": []})

    with pytest.raises(ContentExtractorError) as exc_info:
        await extractor.extract("https://example.com")

    messaggio = str(exc_info.value)
    assert "non esistere o essere vuota" in messaggio
    assert not messaggio.startswith(PREFISSO_ERRORE_CLIENT)


# Risultato presente ma senza testo → pagina senza contenuto estraibile
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
    """Due forme diverse della stessa risposta, e Tavily le produce entrambe.

    `results[0].get("raw_content", "")` le appiattisce sullo stesso valore: il
    parametro serve a impedire che il default sparisca dal `get` senza che
    nulla se ne accorga.
    """
    extractor = make_extractor({"results": [primo_risultato]})

    with pytest.raises(ContentExtractorError) as exc_info:
        await extractor.extract("https://example.com")

    messaggio = str(exc_info.value)
    assert "non contiene testo" in messaggio, caso
    assert not messaggio.startswith(PREFISSO_ERRORE_CLIENT), caso


# Il client solleva → l'errore diventa un errore della porta, causa conservata
async def test_un_errore_del_client_diventa_un_errore_di_porta() -> None:
    """E' il confine dell'esagono: fuori di qui nessuno conosce Tavily.

    Il `from exc` conta quanto la traduzione. La rotta registra lo stacktrace e
    mostra all'utente un messaggio pulito (R-110-F-Ob): senza la causa
    concatenata, lato server resterebbe soltanto il messaggio riscritto e la
    diagnosi ripartirebbe da zero. Stesso idioma di test_fetch_url.py.

    Il test prova anche che l'eccezione sopravvive al salto di thread di
    `asyncio.to_thread`, che e' cio' che la #05 ha introdotto sotto a questa riga.
    """
    guasto = ConnectionError("connessione rifiutata dall'host")
    extractor = make_extractor_guasto(guasto)

    with pytest.raises(ContentExtractorError) as exc_info:
        await extractor.extract("https://example.com")

    assert str(exc_info.value).startswith(PREFISSO_ERRORE_CLIENT)
    assert "connessione rifiutata dall'host" in str(exc_info.value)
    assert exc_info.value.__cause__ is guasto


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
