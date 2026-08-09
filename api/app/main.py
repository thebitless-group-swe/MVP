from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .infrastructure.adapters.litellm_client import LiteLLMClient
from .llm import close_content_extractor, get_llm_client
from .routes import (
    constants_router,
    critique_router,
    generate_link_router,
    generate_router,
    grammar_router,
    rewrite_router,
    summarize_router,
    translate_router,
)
from .schemas import FIELD_LABELS, ErrorResponse
from .settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Rilascia allo shutdown le risorse dei singleton costruiti a runtime.

    Entrambi gli adattatori tengono un pool di connessioni e vivono quanto il
    processo (`@lru_cache`), ma nessuno dei due veniva chiuso: `aclose` esisteva
    con la docstring «da invocare allo shutdown dell'app» e non era invocato da
    nessuna parte. E' igiene, non un difetto che morde — un pool che resta
    aperto fino alla morte di un processo che sta comunque terminando — ma senza
    un lifespan non c'era il posto dove metterla.

    Il trattamento dei due provider e' asimmetrico perche' i due problemi lo
    sono: `get_llm_client` non ha modi di fallire e si risolve qui con un
    `isinstance`, mentre `get_content_extractor` solleva 503 senza chiave e va
    interrogato attraverso `close_content_extractor`, che sa come e' memoizzato.
    """
    #Startup deliberatamente vuoto. E' qui che andrebbe la validazione delle
    #chiavi obbligatorie al boot: oggi una chiave mancante si scopre alla prima
    #richiesta, cioe' dal primo utente invece che dal log di avvio.
    yield

    #Se nessuna richiesta e' passata, questa e' l'unica costruzione del client:
    #lo si crea per chiuderlo subito. Costa una `httpx.AsyncClient` mai usata, e
    #il provider non puo' fallire, quindi non vale una guardia sulla cache.
    client = get_llm_client()
    #La porta `LLMClient` non dichiara `aclose`, e non deve: il ciclo di vita e'
    #dell'adattatore. Conoscere la classe concreta e' mestiere del composition
    #root, che e' precisamente questo file.
    if isinstance(client, LiteLLMClient):
        await client.aclose()

    await close_content_extractor()


app = FastAPI(title="Second Brain API — PoC", lifespan=lifespan)

#Ogni endpoint che accetta un corpo puo' rispondere 422. Dichiarare qui, in un
#punto solo, che la forma di quella risposta e' ErrorResponse sostituisce lo
#schema HTTPValidationError generato in automatico da FastAPI, che descrive una
#forma (detail come array di oggetti) che l'applicazione non produce piu'.
#Il contratto e il comportamento vanno cambiati insieme: altrimenti openapi.json
#dichiara il falso e il frontend genera tipi che non corrispondono alle risposte.
_VALIDATION_RESPONSE = {422: {"model": ErrorResponse}}

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summarize_router, responses=_VALIDATION_RESPONSE)
app.include_router(generate_router, responses=_VALIDATION_RESPONSE)
app.include_router(generate_link_router, responses=_VALIDATION_RESPONSE)
app.include_router(translate_router, responses=_VALIDATION_RESPONSE)
app.include_router(rewrite_router, responses=_VALIDATION_RESPONSE)
app.include_router(grammar_router, responses=_VALIDATION_RESPONSE)
app.include_router(critique_router, responses=_VALIDATION_RESPONSE)
#constants_router non accetta un corpo: per lui il 422 non e' raggiungibile.
app.include_router(constants_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=str(exc.detail)).model_dump(),
    )


def _describe_validation_error(error: dict) -> str:
    """Traduce un errore di validazione Pydantic in una frase per l'utente.

    R-110-F-Ob impone causa e azione correttiva in linguaggio naturale, senza
    dettagli tecnici. La forma di default di FastAPI viola entrambe le clausole:
    espone `type`, `loc` e `ctx`, e rimanda indietro `input`, cioe' il testo
    scritto dall'utente. Qui nulla di tutto cio' raggiunge la risposta.
    """
    #Il primo elemento di `loc` e' sempre "body": ci interessa il campo.
    location = [part for part in error.get("loc", ()) if part != "body"]
    field = str(location[-1]) if location else ""
    label = FIELD_LABELS.get(field)
    kind = str(error.get("type", ""))

    if kind == "json_invalid":
        return "Il corpo della richiesta non è in formato JSON valido."
    if label is None:
        return "I dati inviati non sono validi. Controlla la richiesta e riprova."
    if kind == "missing":
        return f"Il campo «{label}» è obbligatorio."
    if kind == "string_too_short":
        minimum = error.get("ctx", {}).get("min_length")
        if minimum is not None:
            return f"Il campo «{label}» deve contenere almeno {minimum} caratteri."
        return f"Il campo «{label}» è troppo corto."
    if kind == "string_too_long":
        massimo = error.get("ctx", {}).get("max_length")
        if massimo is not None:
            return (
                f"Il campo «{label}» non può superare {massimo} caratteri: "
                "riduci il testo o elaboralo in più parti."
            )
        return f"Il campo «{label}» è troppo lungo."
    if kind == "literal_error":
        #Non elenchiamo i valori ammessi leggendoli da `ctx`: sono un dettaglio
        #interno di Pydantic e arrivano in inglese. L'interfaccia propone
        #esattamente le opzioni valide, quindi l'azione correttiva e' quella.
        return (
            f"Il valore indicato per «{label}» non è fra quelli ammessi: "
            "scegline uno fra le opzioni proposte."
        )
    if kind.startswith("url_"):
        return (
            "Il link indicato non è un indirizzo valido: controlla che "
            "inizi con http:// o https://."
        )
    return f"Il campo «{label}» non è valido."


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Uniforma il 422 alla stessa forma di ogni altro errore dell'API.

    Senza questo handler `detail` e' un array di oggetti, mentre ErrorResponse
    lo dichiara stringa e lo store del frontend lo tipizza `string | null`.
    """
    messages = [_describe_validation_error(error) for error in exc.errors()]
    #Piu' campi invalidi producono spesso la stessa frase: non ripeterla.
    unique = list(dict.fromkeys(messages))
    detail = " ".join(unique) or "I dati inviati non sono validi."

    return JSONResponse(
        status_code=422,
        content=ErrorResponse(detail=detail).model_dump(),
    )


@app.get("/")
async def health() -> dict:
    return {"status": "ok", "model": get_settings().litellm_model}
