from fastapi import APIRouter
from pydantic import BaseModel

from ..core.domain.values import (
    MAX_PROMPT_LENGTH,
    MAX_TEXT_LENGTH,
    MIN_PROMPT_LENGTH,
    MIN_TEXT_LENGTH,
    NO_ERRORS_MARKER,
    MaxPromptLength,
    MaxTextLength,
    MinPromptLength,
    MinTextLength,
    NoErrorsMarker,
)

router = APIRouter(prefix="/api", tags=["constants"])


class ApiConstants(BaseModel):
    """Costanti del contratto lette dal frontend tramite openapi-typescript.

    Il campo e' tipizzato come letterale, quindi in /openapi.json compare come
    `const`.
    """

    no_errors_marker: NoErrorsMarker = NO_ERRORS_MARKER
    min_text_length: MinTextLength = MIN_TEXT_LENGTH
    min_prompt_length: MinPromptLength = MIN_PROMPT_LENGTH

    max_text_length: MaxTextLength = MAX_TEXT_LENGTH
    max_prompt_length: MaxPromptLength = MAX_PROMPT_LENGTH


@router.get("/constants")
async def constants() -> ApiConstants:
    return ApiConstants()
