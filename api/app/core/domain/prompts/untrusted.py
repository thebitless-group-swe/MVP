"""Confina il contenuto estratto da una pagina fra due marcatori."""

EXTRACTED_CONTENT_OPEN = "<<<CONTENUTO_ESTRATTO"
EXTRACTED_CONTENT_CLOSE = "CONTENUTO_ESTRATTO>>>"

#Se lo cambiate serve un carattere che non compaia nei marcatori e che
#sostituisca uno a uno, il testo e' gia' tagliato a MAX_TEXT_LENGTH.
_DELIMITER_REDACTION = "-"


def _neutralize_delimiters(content: str) -> str:
    """Rende inerti i marcatori che comparissero nel contenuto estratto.

    Senza, una pagina che scrive il marcatore di chiusura a meta' testo chiude
    il recinto da sola e il resto arriva al modello come istruzione.
    """
    for marker in (EXTRACTED_CONTENT_OPEN, EXTRACTED_CONTENT_CLOSE):
        content = content.replace(marker, _DELIMITER_REDACTION * len(marker))
    return content


def wrap_extracted_content(content: str) -> str:
    return (
        f"{EXTRACTED_CONTENT_OPEN}\n"
        f"{_neutralize_delimiters(content)}\n"
        f"{EXTRACTED_CONTENT_CLOSE}"
    )
