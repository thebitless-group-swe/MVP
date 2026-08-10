"""Use case: riscrivere un testo nel registro stilistico richiesto.

Forma e convenzioni sono quelle fissate dal pilota in summarize.py.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_rewrite_messages
from ..domain.values import Style
from ..ports.llm_client import LLMClient


def rewrite(text: str, style: Style, llm: LLMClient) -> AsyncIterator[str]:
    """Riscrive `text` nel registro `style`.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata.
    """
    return llm.stream(build_rewrite_messages(text, style))
