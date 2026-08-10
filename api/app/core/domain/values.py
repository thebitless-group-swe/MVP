"""Value object del dominio: i tipi e le costanti che le funzioni AI condividono.

Stanno sotto `core/` perche' il dominio non deve dipendere dal trasporto. Prima
della #40 i prompt — che sono dominio — importavano da `schemas.py`, e quindi
dipendevano dai DTO HTTP, da Pydantic e da FastAPI: la freccia puntava dal
centro verso il bordo. Qui si inverte. Oggi `schemas.py` e
`core/domain/prompts/` importano entrambi da questo modulo, che a sua volta non
importa nulla oltre a `typing`.

Nota: DTO e value object condividono lo stesso Literal per limitare il
boilerplate. Un eventuale mapping (es. ISO 'en' -> 'inglese' in ricezione HTTP)
andrà gestito al confine in api/schemas.py.
"""
from dataclasses import dataclass
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


@dataclass(frozen=True)
class Message:
    """Un messaggio della conversazione con il modello.

    E' il terzo dei modelli che l'architettura si era prefissa: uno per
    validare il JSON in ingresso (`schemas.py`), uno per la logica di business
    (i tipi qui sopra), uno per parlare con il provider. Mancava, e al suo
    posto c'era `list[dict]` — cioe' `list[dict[Any, Any]]`, un sacco senza
    tipo in cui `"rol"` al posto di `"role"` non veniva segnalato da nulla e
    arrivava fino al 400 del provider.

    **Il difetto era `dict`, non `role`/`content`.** La distinzione decide
    quanto grande debba essere la correzione. «Una conversazione e' una lista
    di messaggi con un ruolo» e' vocabolario di dominio legittimo per
    un'applicazione che costruisce prompt, ed e' la forma di tutti i provider
    chat: non e' roba del fornitore da astrarre via. Mancavano solo un nome e
    un punto di traduzione, ed e' esattamente cio' che c'e' qui — la
    traduzione verso il dizionario e' una riga sola, dentro `LiteLLMClient`.

    Per la stessa ragione **non** c'e' altro: nessuna entita' `Conversation`
    con metodi, che duplicherebbe il compito della composizione dei prompt;
    nessun `Enum` per il ruolo, che perderebbe la serializzazione diretta e
    costringerebbe a `.value` ovunque; nessun value object attorno ai chunk in
    uscita, dove `str` e' gia' il tipo giusto; nessuna tabella di mapping per
    provider, con un provider solo. Il criterio per accorgersi di aver
    modellato troppo e' verificabile: se la traduzione nell'adattatore smette
    di stare in una riga, si e' ecceduto.

    **Limite da conoscere.** Sul backend non gira alcun type checker — gli
    strumenti di sviluppo sono pytest e ruff, e ruff non fa type checking.
    Oggi questo tipo fornisce un nome e un punto di traduzione espliciti, non
    un controllo automatico: l'argomento «se sbagli un campo te lo dice
    subito» vale per il TypeScript del frontend e non ha ancora un
    corrispettivo qui.
    """

    role: Literal["system", "user", "assistant"]
    content: str
