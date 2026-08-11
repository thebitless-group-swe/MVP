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

Il trasloco si e' completato con la promozione dei prompt in
`core/domain/prompts/`: `app/llm/` conteneva ormai il solo `prompts.py` e non
esiste piu'. Nessun package del backend prende ancora nome da una tecnologia.
"""
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

#Chiavi la cui assenza impedisce l'avvio del processo.
#
#Ce n'e' una sola, e l'asimmetria con TAVILY_API_KEY e' una decisione, non una
#dimenticanza: senza LITELLM_API_KEY nessuna delle sette funzioni AI puo'
#funzionare, quindi un processo che parte comunque accetta richieste sapendo di
#non poterne servire nessuna. TAVILY_API_KEY serve invece al solo
#/api/generate-from-link: la sua assenza degrada un endpoint su otto, e per
#quello il 503 per richiesta e' la risposta proporzionata. Il test
#`test_senza_tavily_il_processo_parte_lo_stesso` fissa questa scelta, cosi' che
#invertirla richieda di cambiare un'asserzione invece che scivolarci dentro.
_CHIAVI_OBBLIGATORIE_AL_BOOT = ("LITELLM_API_KEY",)


def verifica_chiavi_obbligatorie() -> None:
    """Rifiuta l'avvio se manca una chiave senza cui il processo non serve a nulla.

    **Perche' al boot e non per richiesta.** Una chiave mancante non e' una
    condizione di runtime: e' nota quando il processo parte. Finche' il
    controllo viveva solo nei provider, un deploy senza chiave accettava
    richieste per poi rifiutarle una a una — e su /api/generate-from-link
    produceva anche un effetto collaterale spiacevole, perche' FastAPI risolve
    le dipendenze **prima** di validare il corpo: una richiesta con URL
    malformato riceveva 503 invece del 422 stabilito dalla #04.

    **Perche' qui e non in `main.py`.** Stesso motivo di `close_llm_client` e
    `close_content_extractor` qui sotto: quale chiave serva a quale provider e'
    conoscenza del composition root. Il lifespan chiama e non sa.

    **Perche' qui e non come validatore su `Settings`.** `export_openapi.py`
    importa `app.main`, che costruisce le impostazioni a import-time per il
    CORS: un validatore farebbe fallire l'esportazione del contratto OpenAPI in
    CI, dove le chiavi non ci sono, prima ancora di arrivare ai test.

    **Sul messaggio.** Nomina la variabile d'ambiente, cioe' fa l'opposto di
    quanto R-110-F-Ob impone alle risposte HTTP. Non e' una contraddizione: li'
    il destinatario e' l'utente e i dettagli tecnici sono rumore o rischio, qui
    e' chi fa il deploy e il nome esatto della variabile e' l'unica cosa utile.
    """
    settings = get_settings()
    #Tutte le mancanti in un colpo solo: scoprirle una alla volta, a forza di
    #riavvii falliti, e' il modo peggiore di configurare un ambiente.
    mancanti = [
        nome
        for nome in _CHIAVI_OBBLIGATORIE_AL_BOOT
        if not getattr(settings, nome.lower(), "")
    ]
    if not mancanti:
        return

    messaggio = (
        "Avvio interrotto: configurazione incompleta. "
        f"Variabili d'ambiente obbligatorie assenti o vuote: {', '.join(mancanti)}."
    )
    logger.error(messaggio)
    raise RuntimeError(messaggio)


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
    """Costruisce l'adattatore LLM a partire dalla configurazione.

    Con la chiave assente solleva 503 e non 500, esattamente come
    `get_content_extractor`: una configurazione incompleta e' un servizio
    indisponibile, non un errore di programmazione. Prima i due provider si
    comportavano in modo opposto davanti allo stesso tipo di guasto — l'uno
    503, l'altro un 500 con stacktrace — e la differenza non era motivata da
    nulla.

    In un processo avviato regolarmente questa guardia non puo' scattare, perche'
    `verifica_chiavi_obbligatorie` avrebbe gia' impedito il boot. Resta come
    difesa in profondita': l'app e' costruibile anche senza lifespan — i test
    lo fanno di continuo, ed e' cosi' che `export_openapi` importa il contratto.
    """
    api_key = get_settings().litellm_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail=_LLM_CHIAVE_MANCANTE_DETAIL)
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


#Le due chiusure hanno ora la stessa forma, e prima no.
#
#Il commento che stava qui argomentava che l'asimmetria fosse voluta, perche'
#«get_llm_client non ha modi di fallire, quindi si puo' invocare sempre».
#Quella frase descriveva uno stato, non un principio, e la guardia 503 aggiunta
#qui sopra l'ha resa falsa: adesso invocare `get_llm_client()` a cache vuota e
#senza chiave solleverebbe, e lo shutdown fallirebbe in ogni ambiente privo di
#configurazione — i test per primi. E' esattamente la trappola che
#`close_content_extractor` gia' evitava, arrivata anche all'altro provider.
#Il lifespan chiama entrambe e non sa niente di tutto questo.
async def close_llm_client() -> None:
    """Chiude il client LLM, se ne e' stato costruito uno.

    Vive qui e non nel lifespan per la stessa ragione di
    `close_content_extractor`.
    """
    #Si interroga la cache invece di chiamare il provider: a cache vuota e senza
    #chiave la chiamata solleverebbe 503, facendo fallire l'uscita del processo.
    #Con la cache piena e' un hit, non riesegue il corpo e non puo' sollevare.
    #Effetto collaterale gradito: non si fabbrica piu' una `httpx.AsyncClient`
    #mai usata solo per poterla chiudere.
    if not get_llm_client.cache_info().currsize:
        return

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
