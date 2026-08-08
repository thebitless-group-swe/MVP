from pydantic import BaseModel, Field, HttpUrl

from .core.domain.values import (
    MAX_PROMPT_LENGTH,
    MAX_TEXT_LENGTH,
    MIN_PROMPT_LENGTH,
    MIN_TEXT_LENGTH,
    Hat,
    Language,
    Length,
    Style,
)

# I vocabolari e le soglie vivono in core/domain/values.py: qui restano solo i
# DTO, cioe' il confine HTTP. E' il confine il posto giusto per un eventuale
# adattamento del vocabolario esterno a quello di dominio (vedi la nota in
# values.py); il dominio non deve conoscere la forma della richiesta.

# Etichette in italiano dei campi dei DTO, usate per comporre i messaggi di
# errore 422 in linguaggio naturale (R-110-F-Ob). Stanno qui, accanto ai campi
# che descrivono, cosi' che aggiungere un campo e la sua etichetta siano la
# stessa modifica. Un campo assente da questa mappa produce un messaggio
# generico: meglio vago che tecnico.
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
    #HttpUrl valida schema e forma dell'url: input malformato -> 422
    url: HttpUrl
    length: Length = "medio"


class TranslateRequest(BaseModel):
    text: str = Field(min_length=MIN_TEXT_LENGTH, max_length=MAX_TEXT_LENGTH)
    #Nessun default: lingua, stile e cappello vanno scelti esplicitamente
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
