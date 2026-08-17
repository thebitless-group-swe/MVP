from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Sequence

from ..domain.values import Message


class LLMProviderError(Exception):
    """Errore del provider LLM."""

    pass


class LLMClient(ABC):
    """Porta per lo streaming di completamenti da un provider LLM."""

    @abstractmethod
    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        """Yield chunk testuali (delta.content) dal provider LLM.

        Il default None di max_tokens e' voluto. Traduzione, riscrittura,
        correzione e analisi non lo passano, o troncherebbero l'output di un
        input lungo a meta' frase senza che nessuno se ne accorga. Chi lo
        chiede e chi no lo fissa tests/test_token_budget.py.
        """
        ...
