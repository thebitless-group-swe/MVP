"""Test unitario dello use case di generazione."""
from collections.abc import AsyncIterator

import pytest

from app.core.domain.prompts.rules import LENGTH_INSTRUCTIONS
from app.core.domain.prompts.templates import build_generate_messages
from app.core.domain.values import Length
from app.core.services.generate import generate
from tests.conftest import DummyLLMClient

PROMPT = "Scrivi un testo sul mare d'inverno, con qualche riferimento a Battiato."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


async def test_generate_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(generate(PROMPT, "medio", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


@pytest.mark.parametrize("length", list(LENGTH_INSTRUCTIONS.keys()))
async def test_generate_passes_the_built_messages_to_the_port(
    length: Length,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(generate(PROMPT, length, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_generate_messages(PROMPT, length)


async def test_generate_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = generate(PROMPT, "medio", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
