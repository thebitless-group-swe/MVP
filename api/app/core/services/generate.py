"""Use case: generare un testo nuovo a partire dalle istruzioni dell'utente."""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_generate_messages
from ..domain.values import LENGTH_MAX_TOKENS, Length
from ..ports.llm_client import LLMClient


def generate(prompt: str, length: Length, llm: LLMClient) -> AsyncIterator[str]:
    return llm.stream(
        build_generate_messages(prompt, length),
        max_tokens=LENGTH_MAX_TOKENS[length],
    )
