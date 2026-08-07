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
