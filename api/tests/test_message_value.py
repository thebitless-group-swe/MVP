"""Il value object `Message` e il confine che rende utile averlo."""
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from app.core.domain.prompts.templates import build_summarize_messages
from app.core.domain.values import Message

APP = Path(__file__).resolve().parent.parent / "app"
ADATTATORE = APP / "infrastructure" / "adapters" / "litellm_client.py"


class TestValueObject:
    def test_due_messaggi_uguali_sono_uguali(self) -> None:
        """E' cio' che permette ai test degli use case di confrontare i prompt."""
        assert Message(role="user", content="ciao") == Message(
            role="user", content="ciao"
        )
        assert Message(role="user", content="ciao") != Message(
            role="system", content="ciao"
        )

    def test_e_immutabile(self) -> None:
        """Un prompt costruito non si modifica: si ricostruisce."""
        messaggio = Message(role="user", content="ciao")

        with pytest.raises(FrozenInstanceError):
            messaggio.content = "altro"  # type: ignore[misc]

    def test_i_template_producono_message(self) -> None:
        messaggi = build_summarize_messages("Un testo qualunque da riassumere.")

        assert all(isinstance(m, Message) for m in messaggi)


def test_la_forma_a_dizionario_vive_solo_nell_adattatore() -> None:
    """Guardia architetturale, in attesa di uno strumento che la faccia meglio."""
    colpevoli = sorted(
        percorso.relative_to(APP).as_posix()
        for percorso in APP.rglob("*.py")
        if percorso != ADATTATORE and '"role":' in percorso.read_text(encoding="utf-8")
    )

    assert colpevoli == []
