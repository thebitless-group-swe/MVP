"""Use case: generare un testo nuovo a partire dalle istruzioni dell'utente.

Forma e convenzioni sono quelle fissate dal pilota in summarize.py.
"""
from collections.abc import AsyncIterator

from ...llm.prompts import build_generate_messages
from ..domain.values import Length
from ..ports.llm_client import LLMClient


def generate(prompt: str, length: Length, llm: LLMClient) -> AsyncIterator[str]:
    """Genera un testo a partire da `prompt`, della lunghezza richiesta.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata.
    """
    return llm.stream(build_generate_messages(prompt, length))
