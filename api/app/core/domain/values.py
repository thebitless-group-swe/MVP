"""Value object del dominio: i tipi e le costanti che le funzioni AI condividono.

Stanno sotto `core/` perche' il dominio non deve dipendere dal trasporto. Prima
di questa issue `llm/prompts.py` importava da `schemas.py`: i prompt, che sono
dominio, dipendevano dai DTO HTTP e quindi da Pydantic e da FastAPI. La freccia
puntava dal centro verso il bordo. Qui si inverte: `schemas.py` e
`llm/prompts.py` importano entrambi da questo modulo, che a sua volta non
importa nulla oltre a `typing`.

Nota: DTO e value object condividono lo stesso Literal per limitare il
boilerplate. Un eventuale mapping (es. ISO 'en' -> 'inglese' in ricezione HTTP)
andrà gestito al confine in api/schemas.py.
"""
from typing import Literal

# Alias riusabile per la lunghezza richiesta delle funzioni AI.
Length = Literal["breve", "medio", "dettagliato"]

# Lingue di destinazione della traduzione (UC 53.1).
Language = Literal["inglese", "francese", "tedesco", "spagnolo"]

# Registri disponibili per la riscrittura (UC 54.1).
Style = Literal["formale", "informale", "accademico"]

# I sei cappelli per pensare (R-65 -> R-70).
Hat = Literal["bianco", "rosso", "giallo", "nero", "verde", "blu"]

# Lunghezza minima del testo accettato dalle funzioni AI (R-81).
MinTextLength = Literal[10]
MIN_TEXT_LENGTH: MinTextLength = 10

# Lunghezza minima delle istruzioni accettate dalla generazione: un prompt piu'
# corto non identifica un contenuto, e spendere una chiamata al provider per
# scoprirlo e' spreco.
MinPromptLength = Literal[3]
MIN_PROMPT_LENGTH: MinPromptLength = 3

MaxTextLength = Literal[12000]
MAX_TEXT_LENGTH: MaxTextLength = 12000

MaxPromptLength = Literal[2000]
MAX_PROMPT_LENGTH: MaxPromptLength = 2000

# Sentinella emessa dalla correzione grammaticale quando non trova errori.
# Il tipo viene esposto in /openapi.json da ApiConstants (routes/constants.py);
# l'annotazione sul valore lega le due dichiarazioni, cosi' cambiare la stringa
# in un punto solo non compila.
NoErrorsMarker = Literal["NESSUN_ERRORE_RILEVATO"]
NO_ERRORS_MARKER: NoErrorsMarker = "NESSUN_ERRORE_RILEVATO"
