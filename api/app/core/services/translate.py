"""Use case: tradurre un testo nella lingua di destinazione scelta.

Forma e convenzioni sono quelle fissate dal pilota in summarize.py.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_translate_messages
from ..domain.values import Language
from ..ports.llm_client import LLMClient


def translate(text: str, target_language: Language, llm: LLMClient) -> AsyncIterator[str]:
    """Traduce `text` verso `target_language`.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata.
    """
    return llm.stream(build_translate_messages(text, target_language))
