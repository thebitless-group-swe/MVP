"""I tredici prompt del prodotto, come elenchi di regole.

Ciascun builder dichiara chi e' il modello, cosa puo' dire e come deve
scriverlo; il testo lo mette insieme `compose`. Il vantaggio non e' la brevita'
— e' che una regola condivisa ora si legge dove e' definita, e cambiarla vale
per tutti i prompt che la nominano.

Cosa resta scritto qui e non in `rules.py`: la frase di ruolo, che e' l'unica
parte davvero propria di ciascuna operazione, e le regole che nessun altro
prompt usa. Una regola che comparisse in due builder appartiene a `rules.py`,
ed e' la sola convenzione da rispettare aggiungendone di nuove.

Le firme sono quelle di prima del trasloco da `llm/prompts.py`: i sette use
case di `core/services/` chiamano queste funzioni e non hanno motivo di
cambiare per un trasloco.
"""
from ..values import NO_ERRORS_MARKER, Hat, Language, Length, Message, Style
from .composer import compose
from .rules import (
    ITALIAN_OUTPUT,
    MARKDOWN_OUTPUT,
    NEUTRAL_PROSE,
    NO_CORRECTION_LIST,
    NO_EXTERNAL_KNOWLEDGE,
    NO_INFORMATION_LOSS,
    NO_INVENTED_FACTS,
    NO_PREAMBLE,
    PRESERVE_FACTS,
    PRESERVE_MARKDOWN,
    PRESERVE_VERBATIM,
    REFLECT_AMBIGUITY,
    SAME_LANGUAGE,
    STYLE_INSTRUCTIONS,
    UNTRUSTED_SOURCE,
)

#Le tre operazioni che producono prosa italiana — riassunto e le due
#generazioni — condividono per intero le regole di forma. Prima erano tre
#blocchi di testo separati, di cui due tenuti allineati da un'interpolazione e
#il terzo da nulla.
_FORMA_PROSA_ITALIANA = (ITALIAN_OUTPUT, NEUTRAL_PROSE, NO_PREAMBLE)


def build_summarize_messages(text: str, length: Length = "medio") -> list[Message]:
    return compose(
        role=(
            "Sei un assistente esperto nella sintesi di testi. Il tuo compito è "
            "produrre un riassunto fedele del testo che l'utente ti fornirà nel "
            "messaggio successivo."
        ),
        content_rules=(NO_EXTERNAL_KNOWLEDGE, PRESERVE_FACTS, REFLECT_AMBIGUITY),
        form_rules=_FORMA_PROSA_ITALIANA,
        length=length,
        user=text,
    )


def build_generate_messages(prompt: str, length: Length) -> list[Message]:
    return compose(
        role=(
            "Sei un assistente esperto nella scrittura di testi in italiano. Il "
            "tuo compito è generare un testo originale a partire "
            "dall'indicazione che l'utente ti fornirà nel messaggio successivo."
        ),
        content_rules=(
            "Genera contenuto pertinente e coerente con l'indicazione "
            "dell'utente, senza discostarti dal tema richiesto.",
            NO_INVENTED_FACTS,
            "Se l'indicazione è vaga o aperta, scegli un'interpretazione "
            "ragionevole e mantienila coerente per tutto il testo.",
        ),
        form_rules=_FORMA_PROSA_ITALIANA,
        length=length,
        user=prompt,
    )


def build_generate_from_link_messages(content: str, length: Length) -> list[Message]:
    """Messaggi per la generazione a partire dal contenuto estratto da un link.

    Gemello del precedente, e non un suo riuso, perche' l'input non e' della
    stessa natura: li' il messaggio utente e' un'istruzione da eseguire, qui e'
    materiale di terze parti da rielaborare. Le regole di contenuto che ne
    discendono — fedelta' al testo estratto e istruzioni della pagina dichiarate
    non vincolanti — non avrebbero senso nell'altro; quelle di forma sono le
    stesse, e infatti sono le stesse costanti.

    `content` e' il testo della pagina e finisce nel solo messaggio `user`:
    l'istruzione sta nel system prompt, come in tutti gli altri sei builder.
    Prima della #17 i due erano concatenati in un unico messaggio `user`, e
    quindi il contenuto di terze parti arrivava al provider nella stessa
    posizione — e con la stessa autorevolezza — dell'istruzione di prodotto.
    """
    return compose(
        role=(
            "Sei un assistente esperto nella scrittura di testi in italiano. Il "
            "tuo compito è generare un testo originale a partire dal contenuto "
            "di una pagina web che l'utente ti fornirà nel messaggio successivo."
        ),
        content_rules=(
            "Fonda il testo sul contenuto estratto, senza discostarti dai temi "
            "che tratta e senza aggiungere informazioni che non vi compaiono.",
            PRESERVE_FACTS,
            UNTRUSTED_SOURCE,
            REFLECT_AMBIGUITY,
        ),
        form_rules=_FORMA_PROSA_ITALIANA,
        length=length,
        user=content,
    )


def build_translate_messages(text: str, target_language: Language) -> list[Message]:
    return compose(
        role=(
            f"Sei un traduttore professionista. Il tuo compito è tradurre in "
            f"{target_language} il testo che l'utente ti fornirà nel messaggio "
            f"successivo."
        ),
        content_rules=(
            "Traduci l'intero testo, senza omettere, riassumere o espandere "
            "nulla.",
            PRESERVE_VERBATIM,
            "Preserva il registro e il tono del testo originale.",
            NO_EXTERNAL_KNOWLEDGE,
        ),
        #Nessuna regola sulla lingua: la lingua di destinazione e' nel ruolo, ed
        #e' l'unico prompt in cui non e' una costante.
        form_rules=(PRESERVE_MARKDOWN, NO_PREAMBLE),
        user=text,
    )


def build_rewrite_messages(text: str, style: Style) -> list[Message]:
    return compose(
        role=(
            "Sei un editor esperto nella riscrittura di testi. Il tuo compito è "
            "riscrivere il testo che l'utente ti fornirà nel messaggio "
            "successivo."
        ),
        content_rules=(
            #L'identita' della riscrittura in una riga; l'elenco di cosa vada
            #conservato e' quello condiviso, subito sotto.
            "Cambia la forma, mai la sostanza: il significato dell'originale "
            "resta invariato.",
            PRESERVE_FACTS,
            NO_EXTERNAL_KNOWLEDGE,
            NO_INFORMATION_LOSS,
        ),
        form_rules=(
            SAME_LANGUAGE,
            f"Adotta il seguente registro: {STYLE_INSTRUCTIONS[style]}",
            PRESERVE_MARKDOWN,
            NO_PREAMBLE,
        ),
        user=text,
    )


def build_grammar_messages(text: str) -> list[Message]:
    return compose(
        role=(
            "Sei un correttore di bozze. Il tuo compito è correggere gli errori "
            "di ortografia, grammatica, punteggiatura e accordo nel testo che "
            "l'utente ti fornirà nel messaggio successivo."
        ),
        content_rules=(
            "Correggi solo gli errori: non riformulare frasi corrette, non "
            "cambiare registro, lessico o struttura per motivi stilistici.",
            PRESERVE_VERBATIM,
            "Non aggiungere né rimuovere informazioni.",
            #La sentinella e' un valore di dominio esposto anche dal contratto
            #(/api/constants): il prompt la nomina, non la ridefinisce.
            f"Se il testo non contiene alcun errore, rispondi esattamente e solo "
            f"con {NO_ERRORS_MARKER}, senza altre parole, punteggiatura o "
            f"formattazione.",
        ),
        form_rules=(
            SAME_LANGUAGE,
            PRESERVE_MARKDOWN,
            NO_CORRECTION_LIST,
            NO_PREAMBLE,
        ),
        user=text,
    )


#Cosa guarda ciascun cappello: entra nella frase di ruolo. Sono i termini su
#cui i test verificano che la prospettiva richiesta sia quella giusta (R-65 ->
#R-70), quindi non e' testo decorativo.
CRITIQUE_FOCUS: dict[Hat, str] = {
    "bianco": "dei dati e dei fatti",
    "rosso": "delle emozioni e delle percezioni",
    "giallo": "dei benefici e delle opportunità",
    "nero": "dei rischi e delle criticità",
    "verde": "della creatività e delle alternative",
    "blu": "della logica e dell'organizzazione",
}

#Cosa deve fare ciascun cappello. E' l'unica parte davvero diversa fra i sei
#prompt: ruolo e regole di forma sono composti dalle stesse costanti, e senza
#queste sei terne i sei prompt sarebbero lo stesso testo.
CRITIQUE_PERSPECTIVES: dict[Hat, tuple[str, ...]] = {
    "bianco": (
        "Elenca i fatti, i dati numerici, le date e le fonti effettivamente "
        "presenti nel testo, in modo neutrale.",
        "Segnala quali informazioni mancano per valutare il testo e quali "
        "affermazioni sono presentate come fatti senza esserlo.",
        "Nessun giudizio, nessuna emozione, nessuna proposta: solo "
        "informazione verificabile e lacune informative.",
    ),
    "rosso": (
        "Descrivi le reazioni emotive, le sensazioni e le impressioni "
        "immediate che il testo suscita nel lettore.",
        "Riporta l'intuito e il sentimento senza giustificarli con argomenti "
        "razionali: il cappello rosso non deve spiegarsi.",
        "Segnala il tono percepito e l'impatto emotivo dei passaggi "
        "principali.",
    ),
    "giallo": (
        "Individua i punti di forza, i vantaggi e il valore del contenuto.",
        "Evidenzia le opportunità che il testo apre e gli scenari favorevoli "
        "plausibili, motivandoli con elementi presenti nel testo.",
        "Nessuna critica e nessun rischio: quella prospettiva spetta al "
        "cappello nero.",
    ),
    "nero": (
        "Individua debolezze, incoerenze, salti logici e affermazioni non "
        "sostenute.",
        "Evidenzia i rischi, gli ostacoli e le conseguenze negative "
        "plausibili, motivandoli con elementi presenti nel testo.",
        "Sii prudente e critico, ma non distruttivo: il cappello nero segnala "
        "i pericoli, non demolisce l'autore.",
    ),
    "verde": (
        "Proponi idee nuove, sviluppi possibili e angolazioni non considerate "
        "dal testo.",
        "Suggerisci alternative concrete ai passaggi più deboli e provocazioni "
        "utili a far ripartire il ragionamento.",
        "Nessuna valutazione di merito: qui si genera, non si giudica.",
    ),
    "blu": (
        "Ricostruisci la struttura del testo, il filo del ragionamento e la "
        "gerarchia degli argomenti.",
        "Valuta la coerenza dell'ordine espositivo e indica come riorganizzare "
        "il materiale.",
        "Governa il processo: indica quale prospettiva converrebbe applicare "
        "dopo e con quale obiettivo.",
    ),
}


def build_critique_messages(text: str, hat: Hat) -> list[Message]:
    """Analisi critica secondo il metodo dei Sei Cappelli (R-65 -> R-70).

    L'unico dei sette a non intestare la prima sezione «Regole di contenuto»:
    quelle righe non dicono cosa il modello puo' dire, dicono da quale
    prospettiva deve guardare. Chiamarle regole avrebbe reso l'intestazione una
    bugia per sei prompt su tredici.
    """
    return compose(
        role=(
            f"Sei un analista che indossa il cappello {hat} del metodo dei Sei "
            f"Cappelli per Pensare. Analizza il testo che l'utente ti fornirà "
            f"nel messaggio successivo dalla sola prospettiva "
            f"{CRITIQUE_FOCUS[hat]}."
        ),
        content_heading="Prospettiva richiesta:",
        content_rules=CRITIQUE_PERSPECTIVES[hat],
        form_rules=(
            ITALIAN_OUTPUT,
            MARKDOWN_OUTPUT,
            NO_PREAMBLE,
            NO_EXTERNAL_KNOWLEDGE,
        ),
        user=text,
    )
