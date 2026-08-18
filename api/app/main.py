from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.errors import describe_validation_error
from .api.routes import (
    constants_router,
    critique_router,
    generate_link_router,
    generate_router,
    grammar_router,
    rewrite_router,
    summarize_router,
    translate_router,
)
from .api.schemas import ErrorResponse
from .dependencies import (
    close_content_extractor,
    close_llm_client,
    get_settings,
    verifica_chiavi_obbligatorie,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Controlli all'avvio e chiusura delle risorse allo spegnimento."""
    #Sollevare qui fa uscire uvicorn invece di lasciarlo accettare richieste
    #che non puo' soddisfare.
    verifica_chiavi_obbligatorie()

    yield

    await close_llm_client()
    await close_content_extractor()


app = FastAPI(title="Second Brain API — PoC", lifespan=lifespan)

#Se cambiate la forma della risposta 422 cambiate anche questo, altrimenti
#openapi.json dichiara il falso e il frontend genera tipi sbagliati.
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
app.include_router(constants_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=str(exc.detail)).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Da' al 422 la stessa forma di ogni altro errore dell'API.

    Senza, detail sarebbe un array di oggetti e il frontend lo tipizza stringa.
    """
    messages = [describe_validation_error(error) for error in exc.errors()]
    unique = list(dict.fromkeys(messages))
    detail = " ".join(unique) or "I dati inviati non sono validi."

    return JSONResponse(
        status_code=422,
        content=ErrorResponse(detail=detail).model_dump(),
    )


@app.get("/")
async def health() -> dict:
    return {"status": "ok", "model": get_settings().litellm_model}
