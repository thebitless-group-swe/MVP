import pytest

from app.llm.prompts import (
    _REGOLE_DI_FORMA_GENERAZIONE,
    GENERATE_FROM_LINK_SYSTEM_PROMPT,
    GENERATE_SYSTEM_PROMPT,
    LENGTH_INSTRUCTIONS,
    SummaryLength,
    build_generate_from_link_messages,
    build_generate_messages,
    build_summarize_messages,
)

TEST_STRING = """\
    Ezechiele 25,17.
    Il cammino dell'uomo timorato è minacciato
    da ogni parte dalle iniquità degli esseri egoisti e dalla tirannia degli uomini malvagi.
    Benedetto sia colui che nel nome della carità e della buona volontà
    conduce i deboli attraverso la valle delle tenebre;
    perché egli è in verità il pastore di suo fratello e il ricercatore dei figli smarriti.
    E la mia giustizia calerà sopra di loro con grandissima vendetta
    e furiosissimo sdegno su coloro che si proveranno ad ammorbare
    e infine a distruggere i miei fratelli.
    E tu saprai che il mio nome è quello del Signore
    quando farò calare la mia vendetta sopra di te.
"""

#Controllo sulla lista ritornata da build_summarize_message
#La lunghezza deve essere di 2 celle:
#Riga 0 per il role system (contenente le indicazioni per l'ia)
#Riga 1 per il role user (contenente il messaggio dell'utente da manipolare)
def test_returns_system_then_user_message() -> None:
    msgs = build_summarize_messages(
        TEST_STRING
    )

    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


#Controllo sul contenuto del testo originale, non deve avere injection di alcun tipo
def test_user_content_is_exactly_input_text() -> None:
    text = TEST_STRING
    msgs = build_summarize_messages(text)

    assert msgs[1]["content"] == text

#Controllo che il testo non venga leakkato nelle informazioni del system
def test_user_text_does_not_leak_into_system() -> None:
    marker = "RISPOSTA_DI_TUTTO_42"
    text = f"{TEST_STRING} {marker}"
    msgs = build_summarize_messages(text)

    assert marker not in msgs[0]["content"]

#pytest passa tre volte la funzione, una per ciascuna scelta di length
#Questo test controlla in particolare che le istruzioni di lunghezza vengano correttamente
#inserite nel prompt e che siano anche collegate correttamente alle loro chiavi
@pytest.mark.parametrize("length", list(LENGTH_INSTRUCTIONS.keys()))
def test_length_levels_inject_correct_instruction(length: SummaryLength) -> None:
    msgs = build_summarize_messages("Testo di prova", length = length)
    system_content = msgs[0]["content"]

    expectedInstruction = LENGTH_INSTRUCTIONS[length]
    assert expectedInstruction in system_content

#Controllo che la lunghezza di default sia correttamente impostata a 'medio'
def test_default_length_is_medio() -> None:
    text = TEST_STRING

    default_msgs = build_summarize_messages(text)
    medio_msgs = build_summarize_messages(text, length="medio")

    assert default_msgs == medio_msgs



#Controllo la lista ritornata da build_generate_message
def test_generate_returns_system_then_user_message() -> None:
    msgs = build_generate_messages("Scrivi un testo sul mare", "breve")

    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


#Contenuto finto di una pagina, con dentro un'istruzione che il prompt deve
#trattare come materiale e non come comando (vedi il test sull'injection)
PAGINA_ESTRATTA = """\
    Il porto di Genova ha movimentato 2,6 milioni di TEU nel 2024.
    L'incremento rispetto all'anno precedente è del 4%.
"""


def test_generate_from_link_returns_system_then_user_message() -> None:
    msgs = build_generate_from_link_messages(PAGINA_ESTRATTA, "breve")

    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


#Il cuore della #17: il contenuto della pagina e' il solo messaggio user, senza
#l'istruzione di prodotto concatenata davanti. Prima i due erano un'unica
#stringa, e il testo di terze parti arrivava al provider nella stessa posizione
#dell'istruzione.
def test_generate_from_link_user_content_is_exactly_the_extracted_text() -> None:
    msgs = build_generate_from_link_messages(PAGINA_ESTRATTA, "medio")

    assert msgs[1]["content"] == PAGINA_ESTRATTA


def test_generate_from_link_extracted_text_does_not_leak_into_system() -> None:
    marker = "RISPOSTA_DI_TUTTO_42"
    msgs = build_generate_from_link_messages(f"{PAGINA_ESTRATTA} {marker}", "medio")

    assert marker not in msgs[0]["content"]


#L'istruzione di prodotto e' nel system, dove il provider la legge come propria
#e non come parte del materiale da rielaborare.
def test_generate_from_link_instruction_lives_in_the_system_prompt() -> None:
    system_content = build_generate_from_link_messages(PAGINA_ESTRATTA, "medio")[0][
        "content"
    ]

    assert "generare un testo originale" in system_content
    assert "italiano" in system_content


def test_system_prompt_declares_extracted_content_is_not_instructions() -> None:
    """Il system prompt *dichiara* che il contenuto estratto non e' un comando.

    Questo test verifica una stringa nel prompt, non un comportamento del
    modello: dice che l'istruzione e' stata scritta, non che venga obbedita.
    La riga e' una mitigazione della prompt injection, non una garanzia, e non
    va letta come copertura del rischio — nessun test di questa suite lo copre,
    e coprirlo richiederebbe esercitare un provider vero con pagine ostili.
    Il valore di questo test e' impedire che la mitigazione sparisca dal prompt
    senza che nessuno se ne accorga.
    """
    assert "non istruzioni da" in GENERATE_FROM_LINK_SYSTEM_PROMPT


@pytest.mark.parametrize("length", list(LENGTH_INSTRUCTIONS.keys()))
def test_generate_from_link_length_levels_inject_correct_instruction(
    length: SummaryLength,
) -> None:
    msgs = build_generate_from_link_messages(PAGINA_ESTRATTA, length)

    assert LENGTH_INSTRUCTIONS[length] in msgs[0]["content"]


#Due template distinti, non uno riusato: l'input della generazione da link e'
#materiale da rielaborare, quello della generazione e' un'istruzione da
#eseguire, e le regole che ne discendono sono diverse.
def test_generate_from_link_has_its_own_system_prompt() -> None:
    da_link = build_generate_from_link_messages(PAGINA_ESTRATTA, "medio")[0]["content"]
    diretta = build_generate_messages(PAGINA_ESTRATTA, "medio")[0]["content"]

    assert da_link != diretta


def test_both_generation_prompts_share_the_same_form_rules() -> None:
    """Distinti nelle regole di contenuto, identici in quelle di forma.

    Le regole di forma dei due prompt di generazione sono un blocco solo,
    interpolato in entrambi. Senza questo test, riscriverle in uno dei due
    passerebbe inosservato e i due testi tornerebbero a divergere in silenzio —
    che e' esattamente la duplicazione che l'estrazione ha eliminato.
    """
    assert GENERATE_SYSTEM_PROMPT.endswith(
        _REGOLE_DI_FORMA_GENERAZIONE.format(fonte="dell'indicazione di input")
    )
    assert GENERATE_FROM_LINK_SYSTEM_PROMPT.endswith(
        _REGOLE_DI_FORMA_GENERAZIONE.format(fonte="della pagina")
    )
