"""Use case: analizzare un testo dalla prospettiva di uno dei sei cappelli."""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_critique_messages
from ..domain.values import Hat
from ..ports.llm_client import LLMClient


def critique(text: str, hat: Hat, llm: LLMClient) -> AsyncIterator[str]:
    return llm.stream(build_critique_messages(text, hat))
