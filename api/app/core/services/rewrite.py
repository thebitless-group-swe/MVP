"""Use case: riscrivere un testo nel registro stilistico richiesto."""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_rewrite_messages
from ..domain.values import Style
from ..ports.llm_client import LLMClient


def rewrite(text: str, style: Style, llm: LLMClient) -> AsyncIterator[str]:
    return llm.stream(build_rewrite_messages(text, style))
