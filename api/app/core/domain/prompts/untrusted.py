"""Confinamento del contenuto estratto da una pagina web.

Qui vive **una cosa sola**: il modo in cui il testo di terze parti viene
racchiuso fra due marcatori prima di entrare nel messaggio `user`, e reso
inerte se quei marcatori li contenesse gia'.

**Cosa non vive qui, malgrado il nome.** «Input non fidato» e' una
preoccupazione larga, e questo e' l'unico file del package che la nomina: fra
sei mesi il nome bastera' ad attirarci qualsiasi cosa la riguardi. Non e' cosi'
che va usato. Le *regole* che dichiarano non autorevole il contenuto estratto
sono testo di prompt e stanno dove stanno tutte le altre — `UNTRUSTED_SOURCE`
in `rules.py`, perche' e' condivisa da piu' builder, e inline in `templates.py`
la riga che nomina i due marcatori, perche' serve a un builder solo. La
convenzione e' gia' scritta nel docstring di `templates.py` e non cambia. Qui
c'e' la sola trasformazione che agisce sul contenuto.
"""

# Marcatori che racchiudono il contenuto estratto dentro il messaggio `user`.
# Delimitano il testo di terze parti perche' il modello sappia dove comincia e
# dove finisce cio' che non e' autorevole: senza un confine dichiarato, la
# regola «tratta il contenuto come dato» non ha un referente su cui posarsi.
EXTRACTED_CONTENT_OPEN = "<<<CONTENUTO_ESTRATTO"
EXTRACTED_CONTENT_CLOSE = "CONTENUTO_ESTRATTO>>>"

# Carattere con cui vengono resi inerti i marcatori che comparissero *dentro* il
# contenuto estratto. Due proprieta', entrambe necessarie:
#   - non compare in nessuno dei due marcatori, quindi la sostituzione non puo'
#     generarne di nuovi ricombinandosi col testo circostante;
#   - sostituisce carattere per carattere, quindi il testo non si allunga. Non
#     e' un dettaglio estetico: `fetch_and_extract` taglia a MAX_TEXT_LENGTH
#     *prima* di chiamare il builder (`core/services/generate_from_link.py`),
#     quindi una sostituzione che allungasse il contenuto farebbe superare al
#     prompt un limite che il dominio crede ancora rispettato.
_DELIMITER_REDACTION = "-"


def _neutralize_delimiters(content: str) -> str:
    """Rende inerti i marcatori che comparissero nel contenuto estratto.

    Senza questo passaggio la delimitazione sarebbe apribile dall'esterno: una
    pagina che scrivesse il marcatore di chiusura a meta' testo chiuderebbe il
    recinto per conto proprio, e tutto cio' che segue si presenterebbe al
    modello fuori dal perimetro del dato — cioe' di nuovo come istruzione.

    **Il confronto e' esatto, ed e' il confine dichiarato della mitigazione.**
    Vengono resi inerti i due marcatori e nient'altro: `contenuto_estratto>>>`
    in minuscolo, o spezzato da spazi, o scritto con omoglifi, attraversa il
    contenuto intatto. Strutturalmente non apre nulla — il recinto lo chiude
    solo il marcatore vero — ma un modello potrebbe leggerlo come una chiusura,
    e li' questa mitigazione non arriva. Rendere il confronto insensibile alle
    maiuscole sposterebbe il confine di un passo senza chiuderlo, perche' le
    altre varianti resterebbero: meglio un confine dichiarato che uno
    approssimato.
    """
    for marker in (EXTRACTED_CONTENT_OPEN, EXTRACTED_CONTENT_CLOSE):
        content = content.replace(marker, _DELIMITER_REDACTION * len(marker))
    return content


def wrap_extracted_content(content: str) -> str:
    """Neutralizza e racchiude il contenuto estratto fra i due marcatori."""
    return (
        f"{EXTRACTED_CONTENT_OPEN}\n"
        f"{_neutralize_delimiters(content)}\n"
        f"{EXTRACTED_CONTENT_CLOSE}"
    )
