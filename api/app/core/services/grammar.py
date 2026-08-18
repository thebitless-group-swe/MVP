"""Use case: correggere gli errori di un testo (UC65)."""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_grammar_messages
from ..ports.llm_client import LLMClient


def grammar(text: str, llm: LLMClient) -> AsyncIterator[str]:
    return llm.stream(build_grammar_messages(text))
