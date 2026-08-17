"""Use case: riassumere un testo (UC62).

Pilota dei sette use case, se ne scrivete un altro copiate questa forma. La
parte che si rompe facilmente e' l'ultima riga: lo stream si restituisce senza
consumarlo, altrimenti sse_response non riesce piu' a intercettare un errore
mentre puo' ancora rispondere 503.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_summarize_messages
from ..domain.values import LENGTH_MAX_TOKENS, Length
from ..ports.llm_client import LLMClient


def summarize(text: str, length: Length, llm: LLMClient) -> AsyncIterator[str]:
    #La lunghezza va al modello due volte apposta, come istruzione nel prompt e
    #come tetto di token (UC62.1, UC67.3 passo 3). Una chiede, l'altro obbliga.
    return llm.stream(
        build_summarize_messages(text, length),
        max_tokens=LENGTH_MAX_TOKENS[length],
    )
