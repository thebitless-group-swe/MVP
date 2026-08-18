"""Mette insieme i due messaggi (system e user) di una richiesta al modello.

Per la relazione sui design pattern, NON e' il pattern Builder e non va
chiamato cosi'. Non c'e' ne' Director ne' gerarchia, e' una funzione che mette
in fila delle costanti.
"""
from collections.abc import Sequence

from ..values import Length, Message
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
) -> list[Message]:
    #`user` deve finire SOLO nel messaggio user, e' cosi' che le istruzioni
    #restano separate dal materiale su cui operano. I test lo controllano.
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
        Message(role="system", content="\n\n".join(sezioni)),
        Message(role="user", content=user),
    ]
