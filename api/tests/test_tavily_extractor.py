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
