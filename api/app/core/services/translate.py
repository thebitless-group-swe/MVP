"""Use case: tradurre un testo nella lingua di destinazione scelta."""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_translate_messages
from ..domain.values import Language
from ..ports.llm_client import LLMClient


def translate(text: str, target_language: Language, llm: LLMClient) -> AsyncIterator[str]:
    #Niente max_tokens qui, troncherebbe la traduzione di un testo lungo.
    return llm.stream(build_translate_messages(text, target_language))
