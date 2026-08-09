"""Composition root: l'unico punto che sa quale adattatore soddisfa quale porta.

Prima della #18 questa conoscenza stava in `llm/__init__.py`, cioe' dentro un
package che si chiama come una delle due tecnologie che compone. Le sette rotte
e `main.py` importavano da li' i propri provider, quindi il nome `llm` compariva
nell'import di moduli che con il provider LLM non c'entrano — la rotta di
generazione da link ne importava anche l'estrattore di contenuti. Qui il modulo
si chiama come il ruolo che ha, ed e' l'unico modulo dell'applicazione che
nomina i due adattatori concreti — `LiteLLMClient` e `TavilyExtractor` — fuori
dai moduli che li definiscono.

**Non ci sono provider di use case.** Con i casi d'uso come funzioni (#16) non
c'e' niente da comporre: la rotta si fa iniettare la porta e la passa alla
funzione. Un `get_summarize_service` sarebbe un livello di indirezione che non
inietta nulla che la rotta non abbia gia'.

Cosa resta fuori, di proposito: `app/llm/prompts.py`. I prompt sono dominio e
vanno promossi dentro `core/`, ma e' un trasloco che tocca tutti e sette i
servizi e va fatto — e rivisto — per conto suo. Dopo la #18 `app/llm/` contiene
quel solo modulo e nessuno importa piu' `app.llm`: solo `app.llm.prompts`.
"""
from functools import lru_cache

from fastapi import HTTPException

from .core.ports.content_extractor import ContentExtractor
from .core.ports.llm_client import LLMClient
from .infrastructure.adapters.litellm_client import LiteLLMClient
from .infrastructure.adapters.tavily_extractor import TavilyExtractor
from .settings import Settings

_CHIAVE_MANCANTE_DETAIL = (
    "Servizio di estrazione contenuti temporaneamente non disponibile "
    "(chiave mancante)."
)


#lru cache esegue la funzione e memorizza il risultato nella cache;
#Le successive chiamate con gli stessi argomenti restituiscono lo stesso
#risultato salvato in cache (oggetto cached)
#In questo caso non ci sono argomenti -> sempre stessa chiave
#Viene eseguito una volta sola, avendo così un'istanza unica per processo (Pattern Singleton)
@lru_cache
def get_settings() -> Settings:
    """Configurazione del processo.

    Vive qui e non in `settings.py` perche' e' un provider, e i provider stanno
    tutti nello stesso posto; `settings.py` conserva `Settings`, cioe' *cosa* e'
    la configurazione, separato da *come* la si ottiene.

    A differenza degli altri due non e' iniettato via `Depends`: nessuna rotta
    lo dichiara, lo chiamano `main.py` e i due provider qui sotto. Nei test si
    controlla con `monkeypatch.setenv` piu' `get_settings.cache_clear()`, non
    con `dependency_overrides` — vedi test_dependencies.py.
    """
    return Settings()


#Per info su @lru_cache vedi get_settings qui sopra
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


#Le due chiusure sono asimmetriche perche' lo sono i due problemi, non per
#distrazione: `get_llm_client` non ha modi di fallire, quindi si puo' invocare
#sempre; `get_content_extractor` solleva 503 con la chiave assente, quindi va
#interrogato attraverso la cache. Livellare le due forme — aggiungendo una
#guardia anche alla prima — nasconderebbe la sola differenza che conta fra i
#due provider. Il lifespan chiama entrambe e non sa niente di tutto questo.
async def close_llm_client() -> None:
    """Chiude il client LLM.

    Vive qui e non nel lifespan per la stessa ragione di
    `close_content_extractor`.
    """
    #Se nessuna richiesta e' passata, questa e' l'unica costruzione del client:
    #lo si crea per chiuderlo subito. Costa una `httpx.AsyncClient` mai usata, e
    #il provider non puo' fallire, quindi non vale una guardia sulla cache.
    client = get_llm_client()
    #La porta `LLMClient` non dichiara `aclose`, e non deve: il ciclo di vita e'
    #dell'adattatore. Conoscere la classe concreta e' mestiere del composition
    #root, che e' precisamente questo file.
    if isinstance(client, LiteLLMClient):
        await client.aclose()


async def close_content_extractor() -> None:
    """Chiude l'adattatore di estrazione, se ne e' stato costruito uno.

    Interrogare la cache invece di chiamare `get_content_extractor()` non e'
    un'ottimizzazione: quel provider solleva 503 quando la chiave manca, quindi
    invocarlo allo shutdown farebbe fallire l'uscita dell'applicazione in ogni
    ambiente senza `TAVILY_API_KEY` — i test per primi. Con la cache piena la
    chiamata e' un hit e non riesegue il corpo, quindi non puo' sollevare.

    Vive qui e non nel lifespan perche' `@lru_cache` e' una scelta di questo
    modulo: il composition root deve sapere quale adattatore soddisfa quale
    porta, non con quale strategia di memoizzazione lo si costruisce.
    """
    if not get_content_extractor.cache_info().currsize:
        return

    extractor = get_content_extractor()
    #La porta non dichiara un ciclo di vita, e non deve: aggiungere `aclose` a
    #`ContentExtractor` obbligherebbe ogni doppio dei test a implementarlo.
    #E' l'adattatore concreto a possedere una risorsa, ed e' qui che si sa quale.
    if isinstance(extractor, TavilyExtractor):
        await extractor.aclose()
