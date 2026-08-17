"""Tipi e costanti di dominio condivisi dalle funzioni AI."""
from dataclasses import dataclass
from typing import Literal

Length = Literal["breve", "medio", "dettagliato"]

#Tetto di token per ogni lunghezza (UC67.3 passo 3, UC62.1). Larghi apposta,
#servono a fermare una generazione impazzita, non a tagliare quella giusta.
LENGTH_MAX_TOKENS: dict[Length, int] = {
    "breve": 256,
    "medio": 640,
    "dettagliato": 1536,
}

# Lingue di destinazione della traduzione (UC63.1).
Language = Literal["inglese", "francese", "tedesco", "spagnolo"]

# Registri disponibili per la riscrittura (UC64.1).
Style = Literal["formale", "informale", "accademico"]

# I sei cappelli per pensare (R-65 -> R-70).
Hat = Literal["bianco", "rosso", "giallo", "nero", "verde", "blu"]

# Lunghezza minima del testo accettato dalle funzioni AI (R-81).
MinTextLength = Literal[10]
MIN_TEXT_LENGTH: MinTextLength = 10

MinPromptLength = Literal[3]
MIN_PROMPT_LENGTH: MinPromptLength = 3

MaxTextLength = Literal[12000]
MAX_TEXT_LENGTH: MaxTextLength = 12000

MaxPromptLength = Literal[2000]
MAX_PROMPT_LENGTH: MaxPromptLength = 2000

#L'annotazione lega il valore al tipo esposto in /openapi.json, cambiarne una
#sola delle due non compila.
NoErrorsMarker = Literal["NESSUN_ERRORE_RILEVATO"]
NO_ERRORS_MARKER: NoErrorsMarker = "NESSUN_ERRORE_RILEVATO"


@dataclass(frozen=True)
class Message:
    """Un messaggio della conversazione con il modello."""

    role: Literal["system", "user", "assistant"]
    content: str
