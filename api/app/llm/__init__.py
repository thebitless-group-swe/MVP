from functools import lru_cache

from fastapi import HTTPException

from ..core.ports.content_extractor import ContentExtractor
from ..infrastructure.adapters.tavily_extractor import TavilyExtractor
from ..settings import get_settings
from .client import LiteLLMClient, LLMClient

_CHIAVE_MANCANTE_DETAIL = (
    "Servizio di estrazione contenuti temporaneamente non disponibile "
    "(chiave mancante)."
)


#Per info su @lru_cache vedi api/app/settings.py
@lru_cache
def get_llm_client() -> LLMClient:
    return LiteLLMClient(get_settings())


@lru_cache
def get_content_extractor() -> ContentExtractor:
    """Costruisce l'adattatore di estrazione a partire dalla configurazione.

    E' l'unico punto in cui la classe concreta viene nominata: la rotta dipende
    dalla porta `ContentExtractor` e non sa cosa ci sia dietro.

    Con la chiave assente solleva 503 e non 500: una configurazione incompleta
    e' un servizio indisponibile, non un errore di programmazione.
    """
    api_key = get_settings().tavily_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail=_CHIAVE_MANCANTE_DETAIL)
    return TavilyExtractor(api_key=api_key)


async def close_content_extractor() -> None:
    """Chiude l'adattatore di estrazione, se ne e' stato costruito uno.

    Interrogare la cache invece di chiamare `get_content_extractor()` non e'
    un'ottimizzazione: quel provider solleva 503 quando la chiave manca, quindi
    invocarlo allo shutdown farebbe fallire l'uscita dell'applicazione in ogni
    ambiente senza `TAVILY_API_KEY` — i test per primi. Con la cache piena la
    chiamata e' un hit e non riesegue il corpo, quindi non puo' sollevare.

    Vive qui e non nel lifespan perche' `@lru_cache` e' una scelta di questo
    modulo: il composition root deve sapere quale adattatore soddisfa quale
    porta, non con quale strategia di memoizzazione lo si costruisce. Si sposta
    insieme ai provider in `api/dependencies.py` (#18).
    """
    if not get_content_extractor.cache_info().currsize:
        return

    extractor = get_content_extractor()
    #La porta non dichiara un ciclo di vita, e non deve: aggiungere `aclose` a
    #`ContentExtractor` obbligherebbe ogni doppio dei test a implementarlo.
    #E' l'adattatore concreto a possedere una risorsa, ed e' qui che si sa quale.
    if isinstance(extractor, TavilyExtractor):
        await extractor.aclose()
