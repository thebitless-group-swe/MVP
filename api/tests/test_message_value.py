"""Il value object `Message` e il confine che rende utile averlo.

`Message` da solo e' dieci righe di dataclass; cio' che vale la pena provare
non e' la dataclass ma le due proprieta' per cui e' stata introdotta:
l'uguaglianza per valore, su cui poggiano i dieci test degli use case, e il
fatto che la forma a dizionario del provider non esca dall'adattatore.
"""
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from app.core.domain.prompts.templates import build_summarize_messages
from app.core.domain.values import Message

APP = Path(__file__).resolve().parent.parent / "app"
ADATTATORE = APP / "infrastructure" / "adapters" / "litellm_client.py"


class TestValueObject:
    def test_due_messaggi_uguali_sono_uguali(self) -> None:
        """E' cio' che permette ai test degli use case di confrontare i prompt.

        `assert client.received_messages == build_summarize_messages(...)`
        funziona perche' l'uguaglianza e' per valore. Con una classe qualunque
        confronterebbe le identita' e sarebbe sempre falso.
        """
        assert Message(role="user", content="ciao") == Message(
            role="user", content="ciao"
        )
        assert Message(role="user", content="ciao") != Message(
            role="system", content="ciao"
        )

    def test_e_immutabile(self) -> None:
        """Un prompt costruito non si modifica: si ricostruisce.

        Senza `frozen`, un consumatore della porta potrebbe riscrivere il
        contenuto di un messaggio dopo che il dominio lo ha prodotto — e il
        prompt che arriva al provider non sarebbe piu' quello che i test dei
        template hanno verificato.
        """
        messaggio = Message(role="user", content="ciao")

        with pytest.raises(FrozenInstanceError):
            messaggio.content = "altro"  # type: ignore[misc]

    def test_i_template_producono_message(self) -> None:
        messaggi = build_summarize_messages("Un testo qualunque da riassumere.")

        assert all(isinstance(m, Message) for m in messaggi)


def test_la_forma_a_dizionario_vive_solo_nell_adattatore() -> None:
    """Guardia architetturale, in attesa di uno strumento che la faccia meglio.

    «role» e «content» come chiavi di dizionario sono il protocollo del
    provider: se ricomparissero in `core/` — in un servizio, in un template,
    in una porta — il dominio tornerebbe a conoscere la forma di filo, che e'
    esattamente cio' che `Message` e' servito a togliergli, e nulla se ne
    accorgerebbe fino alla prossima lettura attenta.

    Un `import-linter` sui package fara' questo lavoro meglio e su piu' fronti
    (e' gia' a backlog); finche' non c'e', questo test costa cinque righe e
    copre il caso che riguarda questa modifica.
    """
    colpevoli = sorted(
        percorso.relative_to(APP).as_posix()
        for percorso in APP.rglob("*.py")
        if percorso != ADATTATORE and '"role":' in percorso.read_text(encoding="utf-8")
    )

    assert colpevoli == []
