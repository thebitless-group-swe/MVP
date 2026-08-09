"""Use case: correggere gli errori di un testo (UC 65).

Forma e convenzioni sono quelle fissate dal pilota in summarize.py.

Unica differenza dai fratelli: nessun import da `domain/values.py`. La
correzione non ha parametri di dominio oltre al testo — `GrammarRequest` ha il
solo campo `text` — quindi qui non c'e' un vocabolario da condividere.
"""
from collections.abc import AsyncIterator

from ...llm.prompts import build_grammar_messages
from ..ports.llm_client import LLMClient


def grammar(text: str, llm: LLMClient) -> AsyncIterator[str]:
    """Corregge gli errori ortografici e grammaticali di `text`.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata.
    """
    return llm.stream(build_grammar_messages(text))
