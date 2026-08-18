"""Test unitario dello use case di riscrittura."""
from collections.abc import AsyncIterator

import pytest

from app.core.domain.prompts.rules import STYLE_INSTRUCTIONS
from app.core.domain.prompts.templates import build_rewrite_messages
from app.core.domain.values import Style
from app.core.services.rewrite import rewrite
from tests.conftest import DummyLLMClient

TEXT = "Il mare d'inverno e' un concetto che il pensiero non considera."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


async def test_rewrite_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(rewrite(TEXT, "formale", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


@pytest.mark.parametrize("style", list(STYLE_INSTRUCTIONS.keys()))
async def test_rewrite_passes_the_built_messages_to_the_port(
    style: Style,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(rewrite(TEXT, style, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_rewrite_messages(TEXT, style)


async def test_rewrite_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = rewrite(TEXT, "formale", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
