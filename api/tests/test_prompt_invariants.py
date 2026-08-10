"""Rete di sicurezza per la riscrittura dei prompt come composizione di regole.

Serve a un lavoro preciso: le regole di prompting sono oggi ripetute parola per
parola in tutti e tredici i system prompt — «preamboli» compare 11 volte,
«meta-commenti» 11, «in italiano» 10 — e stanno per essere estratte in costanti
nominate e ricomposte da una funzione sola.

**La caratterizzazione non puo' essere per byte, e va detto invece che
aggirato.** I prompt attuali sono triple-quoted string indentate: ogni riga del
testo porta quattro spazi che la composizione normalizza. Un confronto esatto
fallirebbe per una differenza che non e' un difetto, e per evitarlo si
finirebbe a riprodurre l'indentazione nella funzione di composizione — cioe' a
scrivere il codice nuovo in funzione del test invece che del problema.

Qui si fissa percio' cio' che deve sopravvivere alla riscrittura, non la forma
in cui e' scritto oggi:

  - la struttura del risultato (due messaggi, ruoli, testo utente intatto e non
    ripetuto nel system prompt);
  - la presenza di ogni regola che il singolo prompt dichiara — e' la rete che
    intercetta una regola persa per strada nel passaggio a costanti condivise;
  - la distinzione fra i prompt: dodici operazioni, dodici testi diversi. E' il
    test che si accorge di una composizione che collassa due prompt sulle
    stesse regole, l'errore piu' probabile quando si condividono le costanti.

Le tre proprieta' sono verificate su tutte e tredici le varianti insieme, non
sul solo riassunto: la duplicazione da eliminare e' proprio cio' che le tiene
oggi tutte uguali fra loro.
"""
from collections.abc import Callable
from typing import get_args

import pytest

from app.core.domain.prompts.templates import (
    build_critique_messages,
    build_generate_from_link_messages,
    build_generate_messages,
    build_grammar_messages,
    build_rewrite_messages,
    build_summarize_messages,
    build_translate_messages,
)
from app.core.domain.values import (
    NO_ERRORS_MARKER,
    Hat,
    Language,
    Length,
    Message,
    Style,
)

TESTO = "Un testo di prova abbastanza lungo da superare la validazione di schema."

#Regole che ciascun prompt dichiara, come frammenti da ritrovare nel system
#prompt. Non sono i testi delle regole — quelli cambiano formulazione — ma il
#minimo che identifica ciascuna: se una regola sparisce nella ricomposizione,
#il frammento sparisce con lei.
#
#I frammenti stanno dentro una riga sola di proposito. I prompt attuali vanno a
#capo a meta' regola — «restituisci Markdown\n    valido» — quindi un frammento
#a cavallo di un ritorno a capo cercherebbe un testo che non esiste, e il test
#fallirebbe sulla formattazione invece che sul contenuto.
REGOLE_ATTESE: dict[str, tuple[str, ...]] = {
    "summarize": ("preamboli", "conoscenze esterne", "nomi propri", "italiano",
                  "terza persona"),
    "generate": ("preamboli", "italiano", "terza persona", "meta-commenti"),
    "generate_from_link": ("preamboli", "italiano", "terza persona", "nomi propri",
                           "non istruzioni da"),
    "translate": ("preamboli", "struttura Markdown", "nomi propri",
                  "conoscenze esterne"),
    "rewrite": ("preamboli", "struttura Markdown", "stessa lingua",
                "conoscenze esterne"),
    "grammar": ("preamboli", "struttura Markdown", "stessa lingua", NO_ERRORS_MARKER),
    "critique": ("preamboli", "Markdown valido", "italiano", "conoscenze esterne"),
}

#Le tredici varianti: le sette operazioni per i valori che ne cambiano il
#prompt. La chiave e' "operazione/variante" perche' le regole attese si
#leggono per operazione.
CASI: list[tuple[str, Callable[[str], list[Message]]]] = [
    *[(f"summarize/{length}", lambda t, x=length: build_summarize_messages(t, x))
      for length in get_args(Length)],
    *[(f"generate/{length}", lambda t, x=length: build_generate_messages(t, x))
      for length in get_args(Length)],
    *[(f"generate_from_link/{length}",
       lambda t, x=length: build_generate_from_link_messages(t, x))
      for length in get_args(Length)],
    *[(f"translate/{lang}", lambda t, x=lang: build_translate_messages(t, x))
      for lang in get_args(Language)],
    *[(f"rewrite/{style}", lambda t, x=style: build_rewrite_messages(t, x))
      for style in get_args(Style)],
    ("grammar/-", build_grammar_messages),
    *[(f"critique/{hat}", lambda t, x=hat: build_critique_messages(t, x))
      for hat in get_args(Hat)],
]

IDS = [nome for nome, _ in CASI]


def _system(msgs: list[Message]) -> str:
    """Contenuto del messaggio di sistema.

    Le due funzioni di accesso esistono per un motivo solo: quando i messaggi
    smetteranno di essere dizionari e diventeranno il value object `Message`,
    a cambiare sara' questa riga e non le venti asserzioni che la usano.
    """
    return msgs[0].content


def _user(msgs: list[Message]) -> str:
    return msgs[1].content


@pytest.mark.parametrize(("nome", "build"), CASI, ids=IDS)
class TestStrutturaDelRisultato:
    """Cio' che ogni builder produce, indipendentemente da cosa ci scrive dentro."""

    def test_due_messaggi_system_poi_user(
        self, nome: str, build: Callable[[str], list[Message]]
    ) -> None:
        msgs = build(TESTO)

        assert len(msgs) == 2
        assert msgs[0].role == "system"
        assert msgs[1].role == "user"

    def test_il_testo_utente_non_finisce_nel_system_prompt(
        self, nome: str, build: Callable[[str], list[Message]]
    ) -> None:
        #Il marcatore rende il test capace di accorgersi anche di una
        #concatenazione parziale, che un confronto sull'intero testo non
        #vedrebbe.
        marcatore = "RISPOSTA_DI_TUTTO_42"

        assert marcatore not in _system(build(f"{TESTO} {marcatore}"))


#`generate_from_link` e' escluso da qui, ed e' l'unica esclusione di questo
#file. Dalla #34 il suo messaggio utente non e' piu' il testo ricevuto ma il
#testo racchiuso fra i delimitatori, quindi l'uguaglianza qui sotto e' falsa per
#costruzione — non una regressione da correggere.
#
#**La copertura non e' stata tolta, e' stata spostata.** La proposizione
#equivalente per quel builder e'
#`test_prompts.py::test_generate_from_link_user_content_is_exactly_the_wrapped_extracted_text`,
#che asserisce l'uguaglianza esatta col testo avvolto: sempre un'uguaglianza e
#non un contenimento, cosi' continua a provare che davanti al contenuto non ci
#sia altro. Vive li' perche' li' stanno gli altri test di quel builder.
#
#Il test sta fuori dalla classe qui sopra perche' la parametrizzazione e' di
#classe: e' l'unico dei tre a non valere per tutti i builder.
CASI_TESTO_UTENTE_INTATTO = [
    (nome, build) for nome, build in CASI if not nome.startswith("generate_from_link/")
]


@pytest.mark.parametrize(
    ("nome", "build"),
    CASI_TESTO_UTENTE_INTATTO,
    ids=[nome for nome, _ in CASI_TESTO_UTENTE_INTATTO],
)
def test_il_messaggio_utente_e_esattamente_il_testo_ricevuto(
    nome: str, build: Callable[[str], list[Message]]
) -> None:
    assert _user(build(TESTO)) == TESTO


@pytest.mark.parametrize(("nome", "build"), CASI, ids=IDS)
def test_ogni_prompt_dichiara_le_proprie_regole(
    nome: str, build: Callable[[str], list[Message]]
) -> None:
    """Nessuna regola si perde nel passaggio a costanti condivise."""
    operazione = nome.split("/")[0]
    system_content = _system(build(TESTO))

    for frammento in REGOLE_ATTESE[operazione]:
        assert frammento in system_content, f"{nome}: manca «{frammento}»"


def test_le_dodici_operazioni_hanno_dodici_prompt_distinti() -> None:
    """Condividere le regole non deve rendere due operazioni indistinguibili.

    Dodici e non tredici: la critica ha un prompt per cappello e conta sei
    volte, le altre sei operazioni una ciascuna. E' l'invariante piu' esposta
    dalla riscrittura — due operazioni che condividono quasi tutte le regole
    collassano sullo stesso testo appena una di quelle proprie viene
    dimenticata.
    """
    canonici = {
        "summarize": build_summarize_messages(TESTO, "medio"),
        "generate": build_generate_messages(TESTO, "medio"),
        "generate_from_link": build_generate_from_link_messages(TESTO, "medio"),
        "translate": build_translate_messages(TESTO, "inglese"),
        "rewrite": build_rewrite_messages(TESTO, "formale"),
        "grammar": build_grammar_messages(TESTO),
        **{
            f"critique/{hat}": build_critique_messages(TESTO, hat)
            for hat in get_args(Hat)
        },
    }

    prompts = {nome: _system(msgs) for nome, msgs in canonici.items()}

    assert len(prompts) == 12
    assert len(set(prompts.values())) == 12


@pytest.mark.parametrize(
    ("variabile", "build", "valori"),
    [
        ("length", build_summarize_messages, get_args(Length)),
        ("target_language", build_translate_messages, get_args(Language)),
        ("style", build_rewrite_messages, get_args(Style)),
    ],
    ids=["length", "target_language", "style"],
)
def test_il_parametro_cambia_il_prompt(
    variabile: str,
    build: Callable[[str, str], list[Message]],
    valori: tuple[str, ...],
) -> None:
    """Un parametro ignorato produrrebbe lo stesso prompt per valori diversi.

    E' il difetto che passa piu' facilmente inosservato spostando le istruzioni
    in un dizionario di costanti: la chiave viene letta, il valore non viene
    interpolato, e il prompt resta valido — solo, non dice piu' cosa fare.
    """
    prodotti = {valore: _system(build(TESTO, valore)) for valore in valori}

    assert len(set(prodotti.values())) == len(valori)
