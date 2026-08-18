"""Test unitario dello use case di correzione grammaticale."""
from collections.abc import AsyncIterator

from app.core.domain.prompts.templates import build_grammar_messages
from app.core.services.grammar import grammar
from tests.conftest import DummyLLMClient

TEXT = "Un testo abbastanza lungo da poter contenere qualche errore di ortografia."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


async def test_grammar_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(grammar(TEXT, dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


async def test_grammar_passes_the_built_messages_to_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(grammar(TEXT, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_grammar_messages(TEXT)


async def test_grammar_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = grammar(TEXT, dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
