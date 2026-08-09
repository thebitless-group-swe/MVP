"""Composizione di un prompt a partire dalle regole che lo definiscono.

**Non e' il pattern Builder, e non va chiamato cosi'.** Il Builder della Gang
of Four ha quattro ruoli — `Director`, `Builder` astratto, `ConcreteBuilder`,
`Product` — e costruisce per parti eterogenee un oggetto complesso. Qui non c'e'
ne' Director ne' gerarchia, e non c'e' nemmeno la variante fluente con i metodi
concatenati e il `build()` finale: c'e' una funzione che mette in fila delle
costanti. Le due alternative sono state considerate e scartate per ragioni
diverse:

  - **variante fluente** (`PromptBuilder().role(...).user(...).build()`): chiude
    esattamente le stesse duplicazioni di questa funzione, al prezzo di una
    classe con sette metodi e uno stato intermedio. Sarebbe stato comprare un
    nome di pattern documentabile, non risolvere un problema in piu';
  - **Template Method**: richiederebbe una classe base astratta e sette
    sottoclassi. I sette prompt condividono *costanti di regola*, non passi di
    algoritmo — l'algoritmo e' uno solo ed e' questa funzione. Qui la
    composizione costa meno dell'ereditarieta'.

**La validazione di completezza e' la firma, non un controllo a runtime.** La
variante fluente aveva bisogno di sollevare `ValueError` da `build()` perche'
i suoi metodi erano tutti opzionali e nulla impediva di dimenticarne uno. Qui
`role` e `user` sono parametri obbligatori: dimenticarne uno e' un `TypeError`
alla chiamata, cioe' un errore piu' presto e piu' preciso di quello che si
sarebbe dovuto scrivere a mano. Restano da verificare i soli valori vuoti, che
la firma non puo' escludere.

Struttura prodotta:

    <ruolo e compito>

    Regole di contenuto:          <- intestazione parametrica: i sei cappelli
    - ...                            usano «Prospettiva richiesta:»

    Regole di forma:
    - ...

    Lunghezza richiesta: ...      <- solo dove l'utente puo' sceglierla
"""
from collections.abc import Sequence

from ..values import Length
from .rules import LENGTH_INSTRUCTIONS

CONTENT_HEADING = "Regole di contenuto:"
FORM_HEADING = "Regole di forma:"
LENGTH_HEADING = "Lunghezza richiesta:"


def _section(heading: str, rules: Sequence[str]) -> str:
    bullets = "\n".join(f"- {rule}" for rule in rules)
    return f"{heading}\n{bullets}"


def compose(
    *,
    role: str,
    user: str,
    content_rules: Sequence[str] = (),
    form_rules: Sequence[str] = (),
    content_heading: str = CONTENT_HEADING,
    length: Length | None = None,
) -> list[dict]:
    """Compone i due messaggi di una richiesta al modello.

    Args:
        role: chi e' il modello e qual e' il suo compito. Apre il system prompt.
        user: il testo dell'utente. Finisce **solo** nel messaggio `user`: e' la
            proprieta' che tiene separate le istruzioni di prodotto dal
            materiale su cui operano, e i test la verificano su tutti i prompt.
        content_rules: cosa il modello puo' dire.
        form_rules: come deve essere scritto il risultato.
        content_heading: intestazione della prima sezione, dove «regole di
            contenuto» non e' il nome giusto per cio' che contiene.
        length: se presente, aggiunge in coda l'istruzione di lunghezza.

    Raises:
        ValueError: se `role` o `user` sono vuoti. Sono i due elementi senza i
            quali il prompt non e' una richiesta: il primo non direbbe cosa
            fare, il secondo su cosa farlo.
    """
    if not role:
        raise ValueError("Il prompt non dichiara un ruolo")
    if not user:
        raise ValueError("Il prompt non ha un testo utente")

    sezioni = [role]
    if content_rules:
        sezioni.append(_section(content_heading, content_rules))
    if form_rules:
        sezioni.append(_section(FORM_HEADING, form_rules))
    if length is not None:
        sezioni.append(f"{LENGTH_HEADING} {LENGTH_INSTRUCTIONS[length]}")

    return [
        {"role": "system", "content": "\n\n".join(sezioni)},
        {"role": "user", "content": user},
    ]
