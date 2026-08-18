"""Composition root, l'unico posto che sa quale adattatore sta dietro a quale porta."""
import logging
from functools import lru_cache

from fastapi import HTTPException

from .core.ports.content_extractor import ContentExtractor
from .core.ports.llm_client import LLMClient
from .infrastructure.adapters.litellm_client import LiteLLMClient
from .infrastructure.adapters.tavily_extractor import TavilyExtractor
from .settings import Settings

logger = logging.getLogger(__name__)

_CHIAVE_MANCANTE_DETAIL = (
    "Servizio di estrazione contenuti temporaneamente non disponibile "
    "(chiave mancante)."
)

_LLM_CHIAVE_MANCANTE_DETAIL = (
    "Servizio di elaborazione temporaneamente non disponibile (chiave mancante)."
)

#Tavily non c'e' apposta, la sua assenza rompe solo generate-from-link e per
#quello basta il 503 per richiesta.
_CHIAVI_OBBLIGATORIE_AL_BOOT = ("LITELLM_API_KEY",)


def verifica_chiavi_obbligatorie() -> None:
    """Blocca l'avvio se manca una chiave senza cui il processo non serve a nulla."""
    settings = get_settings()
    mancanti = [
        nome
        for nome in _CHIAVI_OBBLIGATORIE_AL_BOOT
        if not getattr(settings, nome.lower(), "")
    ]
    if not mancanti:
        return

    #Il nome della variabile qui ci va, lo legge chi fa il deploy.
    messaggio = (
        "Avvio interrotto: configurazione incompleta. "
        f"Variabili d'ambiente obbligatorie assenti o vuote: {', '.join(mancanti)}."
    )
    logger.error(messaggio)
    raise RuntimeError(messaggio)


#lru_cache senza argomenti vuol dire una sola istanza per processo (Singleton).
@lru_cache
def get_settings() -> Settings:
    """Configurazione del processo, nei test si pilota con setenv piu' cache_clear()."""
    return Settings()


@lru_cache
def get_llm_client() -> LLMClient:
    """Costruisce l'adattatore LLM a partire dalla configurazione."""
    api_key = get_settings().litellm_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail=_LLM_CHIAVE_MANCANTE_DETAIL)
    return LiteLLMClient(get_settings())


@lru_cache
def get_content_extractor() -> ContentExtractor:
    api_key = get_settings().tavily_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail=_CHIAVE_MANCANTE_DETAIL)
    return TavilyExtractor(api_key=api_key)


async def close_llm_client() -> None:
    #Si guarda la cache invece di chiamare il provider, che a cache vuota e
    #senza chiave solleverebbe 503 e farebbe fallire lo shutdown.
    if not get_llm_client.cache_info().currsize:
        return

    client = get_llm_client()
    if isinstance(client, LiteLLMClient):
        await client.aclose()


async def close_content_extractor() -> None:
    if not get_content_extractor.cache_info().currsize:
        return

    extractor = get_content_extractor()
    if isinstance(extractor, TavilyExtractor):
        await extractor.aclose()
