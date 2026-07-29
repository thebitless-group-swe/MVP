from typing import Literal

from pydantic import BaseModel, Field

# Alias riusabile per la lunghezza richiesta delle funzioni AI.
Length = Literal["breve", "medio", "dettagliato"]


class TextRequest(BaseModel):
    text: str = Field(min_length=10)
    length: Length = "medio"


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3)
    length: Length = "medio"


class LinkRequest(BaseModel):
    # url e' solo str per ora: la validazione vera arriva in B-05.
    url: str
    length: Length = "medio"


class ErrorResponse(BaseModel):
    detail: str
