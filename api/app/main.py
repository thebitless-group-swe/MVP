from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routes import generate_link_router, generate_router, summarize_router
from .schemas import ErrorResponse
from .settings import get_settings

app = FastAPI(title="Second Brain API — PoC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summarize_router)
app.include_router(generate_router)
app.include_router(generate_link_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=str(exc.detail)).model_dump(),
    )


@app.get("/")
async def health() -> dict:
    return {"status": "ok", "model": get_settings().litellm_model}
