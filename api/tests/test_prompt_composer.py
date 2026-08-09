"""Test della funzione che compone i prompt.

Distinta da test_prompt_invariants.py, che verifica i tredici prompt del
prodotto: qui si prova il meccanismo a vuoto, con regole finte, perche' le
proprieta' che seguono valgono per qualunque prompt e non per quelli che oggi
esistono.
"""
import pytest

from app.core.domain.prompts.composer import (
    CONTENT_HEADING,
    FORM_HEADING,
    LENGTH_HEADING,
    compose,
)
from app.core.domain.prompts.rules import LENGTH_INSTRUCTIONS
from app.core.domain.values import Message


def _system(msgs: list[Message]) -> str:
    return msgs[0].content


class TestSezioniOpzionali:
    """Una sezione senza regole non compare: niente intestazioni vuote."""

    def test_senza_regole_il_prompt_e_il_solo_ruolo(self) -> None:
        msgs = compose(role="RUOLO", user="TESTO")

        assert _system(msgs) == "RUOLO"

    def test_senza_regole_di_contenuto_l_intestazione_non_compare(self) -> None:
        system = _system(compose(role="RUOLO", form_rules=("A",), user="TESTO"))

        assert CONTENT_HEADING not in system
        assert FORM_HEADING in system

    def test_senza_lunghezza_la_coda_non_compare(self) -> None:
        assert LENGTH_HEADING not in _system(compose(role="RUOLO", user="TESTO"))

    def test_la_lunghezza_arriva_in_coda_come_istruzione(self) -> None:
        system = _system(compose(role="RUOLO", length="breve", user="TESTO"))

        assert system.endswith(f"{LENGTH_HEADING} {LENGTH_INSTRUCTIONS['breve']}")


class TestStruttura:
    def test_le_regole_diventano_un_elenco_puntato(self) -> None:
        system = _system(
            compose(role="RUOLO", content_rules=("PRIMA", "SECONDA"), user="TESTO")
        )

        assert f"{CONTENT_HEADING}\n- PRIMA\n- SECONDA" in system

    def test_l_intestazione_del_contenuto_e_parametrica(self) -> None:
        """Serve ai sei cappelli, dove quelle righe non sono regole.

        Sono la prospettiva da cui guardare il testo: chiamarle «regole di
        contenuto» renderebbe l'intestazione una bugia per sei prompt su
        tredici.
        """
        system = _system(
            compose(
                role="RUOLO",
                content_heading="Prospettiva richiesta:",
                content_rules=("PRIMA",),
                user="TESTO",
            )
        )

        assert "Prospettiva richiesta:\n- PRIMA" in system
        assert CONTENT_HEADING not in system

    def test_il_testo_utente_e_un_messaggio_a_parte(self) -> None:
        """La proprieta' per cui la funzione esiste in questa forma.

        Il testo dell'utente non e' un pezzo del prompt fra gli altri: e' il
        materiale su cui il prompt opera, e sta nel secondo messaggio. E' cosi'
        che il provider distingue le istruzioni di prodotto da cio' che gli e'
        stato dato in pasto, ed e' l'unica difesa strutturale che il backend ha
        contro un testo che provi a impartire ordini.
        """
        msgs = compose(role="RUOLO", content_rules=("PRIMA",), user="TESTO UTENTE")

        assert len(msgs) == 2
        assert msgs[0].role == "system"
        assert msgs[1] == Message(role="user", content="TESTO UTENTE")
        assert "TESTO UTENTE" not in _system(msgs)


class TestCompletezza:
    """Cosa succede se manca uno dei due elementi indispensabili.

    Un prompt senza ruolo non direbbe cosa fare, uno senza testo utente non
    direbbe su cosa. Che siano parametri obbligatori copre il caso in cui
    vengano dimenticati — e' un TypeError alla chiamata, prima di qualunque
    esecuzione. Restano i valori vuoti, che la firma non puo' escludere: sono
    questi due test.
    """

    def test_ruolo_vuoto_e_un_errore(self) -> None:
        with pytest.raises(ValueError, match="ruolo"):
            compose(role="", user="TESTO")

    def test_testo_utente_vuoto_e_un_errore(self) -> None:
        with pytest.raises(ValueError, match="testo utente"):
            compose(role="RUOLO", user="")
