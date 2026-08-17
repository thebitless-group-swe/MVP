"""Use case: generare un testo nuovo a partire dalle istruzioni dell'utente.

Forma e convenzioni sono quelle fissate dal pilota in summarize.py.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_generate_messages
from ..domain.values import LENGTH_MAX_TOKENS, Length
from ..ports.llm_client import LLMClient


def generate(prompt: str, length: Length, llm: LLMClient) -> AsyncIterator[str]:
    """Genera un testo a partire da `prompt`, della lunghezza richiesta.

    Sul doppio percorso della lunghezza — istruzione nel prompt piu' tetto di
    token sulla chiamata, come chiede UC67.3 — vale quanto argomentato in
    summarize.py.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata.
    """
    return llm.stream(
        build_generate_messages(prompt, length),
        max_tokens=LENGTH_MAX_TOKENS[length],
    )
