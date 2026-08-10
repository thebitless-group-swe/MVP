"""Traduzione degli errori di validazione in messaggi per l'utente.

Sta in `api/` e non in `main.py` perche' e' logica del confine HTTP: conosce la
forma degli errori di Pydantic e il vocabolario dei campi dei DTO, che vivono
accanto in `schemas.py`. `main.py` resta il composition root — crea l'app,
monta i router, registra gli handler — e non contiene piu' la traduzione.

Non sta in `core/` perche' non e' dominio: un consumatore non HTTP dello stesso
caso d'uso non ha errori di validazione Pydantic da tradurre.
"""
from .schemas import FIELD_LABELS


def describe_validation_error(error: dict) -> str:
    """Traduce un errore di validazione Pydantic in una frase per l'utente.

    R-110-F-Ob impone causa e azione correttiva in linguaggio naturale, senza
    dettagli tecnici. La forma di default di FastAPI viola entrambe le clausole:
    espone `type`, `loc` e `ctx`, e rimanda indietro `input`, cioe' il testo
    scritto dall'utente. Qui nulla di tutto cio' raggiunge la risposta.
    """
    #Il primo elemento di `loc` e' sempre "body": ci interessa il campo.
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
        #Non elenchiamo i valori ammessi leggendoli da `ctx`: sono un dettaglio
        #interno di Pydantic e arrivano in inglese. L'interfaccia propone
        #esattamente le opzioni valide, quindi l'azione correttiva e' quella.
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
