from fastapi import APIRouter
from pydantic import BaseModel

from ..core.domain.values import NO_ERRORS_MARKER, NoErrorsMarker

router = APIRouter(prefix="/api", tags=["constants"])


class ApiConstants(BaseModel):
    """Costanti del contratto lette dal frontend tramite openapi-typescript.

    Il campo e' tipizzato come letterale, quindi in /openapi.json compare come
    `const`.
    """

    no_errors_marker: NoErrorsMarker = NO_ERRORS_MARKER


@router.get("/constants")
async def constants() -> ApiConstants:
    return ApiConstants()
