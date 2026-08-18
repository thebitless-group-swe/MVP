from pydantic import BaseModel, Field, HttpUrl

from ..core.domain.values import (
    MAX_PROMPT_LENGTH,
    MAX_TEXT_LENGTH,
    MIN_PROMPT_LENGTH,
    MIN_TEXT_LENGTH,
    Hat,
    Language,
    Length,
    Style,
)

#Servono per i messaggi di errore 422 (R-110-F-Ob). Se aggiungete un campo
#aggiungete anche l'etichetta, senza esce un messaggio generico.
FIELD_LABELS: dict[str, str] = {
    "text": "testo",
    "prompt": "istruzioni",
    "url": "link",
    "target_language": "lingua di destinazione",
    "style": "stile",
    "hat": "cappello",
    "length": "lunghezza",
}


class TextRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH, max_length=MAX_TEXT_LENGTH)
    length: Length = "medio"


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=MIN_PROMPT_LENGTH, max_length=MAX_PROMPT_LENGTH)
    length: Length = "medio"


class LinkRequest(BaseModel):
    url: HttpUrl
    length: Length = "medio"


class TranslateRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH, max_length=MAX_TEXT_LENGTH)
    #Senza default apposta, va scelta
    target_language: Language


class RewriteRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH, max_length=MAX_TEXT_LENGTH)
    style: Style


class GrammarRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH, max_length=MAX_TEXT_LENGTH)


class CritiqueRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH, max_length=MAX_TEXT_LENGTH)
    hat: Hat


class ErrorResponse(BaseModel):
    detail: str
