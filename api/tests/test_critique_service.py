"""Test unitario dello use case di analisi critica."""
from collections.abc import AsyncIterator
from typing import get_args

import pytest

from app.core.domain.prompts.templates import build_critique_messages
from app.core.domain.values import Hat
from app.core.services.critique import critique
from tests.conftest import DummyLLMClient

TEXT = "Il progetto raddoppiera' il fatturato entro sei mesi, senza assumere nessuno."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


@pytest.mark.parametrize("hat", list(get_args(Hat)))
async def test_critique_passes_the_built_messages_to_the_port(
    hat: Hat,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(critique(TEXT, hat, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_critique_messages(TEXT, hat)


async def test_critique_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(critique(TEXT, "nero", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


async def test_critique_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = critique(TEXT, "nero", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
