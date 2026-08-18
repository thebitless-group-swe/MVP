"""Traduce gli errori di validazione di Pydantic in messaggi per l'utente."""
from .schemas import FIELD_LABELS


def describe_validation_error(error: dict) -> str:
    #R-110-F-Ob vuole causa e azione correttiva senza dettagli tecnici. Il
    #formato di FastAPI espone type, loc, ctx e rimanda indietro pure il testo
    #dell'utente, da qui non esce niente di tutto cio'.
    location = [part for part in error.get("loc", ()) if part != "body"]
    field = str(location[-1]) if location else ""
    label = FIELD_LABELS.get(field)
    kind = str(error.get("type", ""))

    if kind == "json_invalid":
        return "Il corpo della richiesta non è in formato JSON valido."
    if label is None:
        return "I dati inviati non sono validi. Controlla la richiesta e riprova."
    if kind == "missing":
        return f"Il campo «{label}» è obbligatorio."
    if kind == "string_too_short":
        minimum = error.get("ctx", {}).get("min_length")
        if minimum is not None:
            return f"Il campo «{label}» deve contenere almeno {minimum} caratteri."
        return f"Il campo «{label}» è troppo corto."
    if kind == "string_too_long":
        massimo = error.get("ctx", {}).get("max_length")
        if massimo is not None:
            return (
                f"Il campo «{label}» non può superare {massimo} caratteri: "
                "riduci il testo o elaboralo in più parti."
            )
        return f"Il campo «{label}» è troppo lungo."
    if kind == "literal_error":
        #I valori ammessi non si leggono da ctx, arrivano in inglese.
        return (
            f"Il valore indicato per «{label}» non è fra quelli ammessi: "
            "scegline uno fra le opzioni proposte."
        )
    if kind.startswith("url_"):
        return (
            "Il link indicato non è un indirizzo valido: controlla che "
            "inizi con http:// o https://."
        )
    return f"Il campo «{label}» non è valido."
