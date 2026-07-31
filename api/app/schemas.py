from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

# Alias riusabile per la lunghezza richiesta delle funzioni AI.
Length = Literal["breve", "medio", "dettagliato"]

# Lingue di destinazione della traduzione (UC 53.1).
Language = Literal["inglese", "francese", "tedesco", "spagnolo"]

# Registri disponibili per la riscrittura (UC 54.1).
Style = Literal["formale", "informale", "accademico"]

# I sei cappelli per pensare (R-65 -> R-70).
Hat = Literal["bianco", "rosso", "giallo", "nero", "verde", "blu"]

# Lunghezza minima del testo accettato dalle funzioni AI (R-81).
MIN_TEXT_LENGTH = 10


class TextRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH)
    length: Length = "medio"


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3)
    length: Length = "medio"


class LinkRequest(BaseModel):
    #HttpUrl valida schema e forma dell'url: input malformato -> 422
    url: HttpUrl
    length: Length = "medio"


class TranslateRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH)
    #Nessun default: lingua, stile e cappello vanno scelti esplicitamente
    target_language: Language


class RewriteRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH)
    style: Style


class GrammarRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH)


class CritiqueRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH)
    hat: Hat


class ErrorResponse(BaseModel):
    detail: str
