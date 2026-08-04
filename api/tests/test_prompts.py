import pytest

from app.llm.prompts import (
    LENGTH_INSTRUCTIONS,
    SummaryLength,
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
