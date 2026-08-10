"""Use case: analizzare un testo dalla prospettiva di uno dei sei cappelli.

Forma e convenzioni sono quelle fissate dal pilota in summarize.py.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_critique_messages
from ..domain.values import Hat
from ..ports.llm_client import LLMClient


def critique(text: str, hat: Hat, llm: LLMClient) -> AsyncIterator[str]:
    """Analizza `text` indossando il cappello `hat`.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata.
    """
    return llm.stream(build_critique_messages(text, hat))
