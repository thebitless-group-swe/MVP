"""Test unitario dello use case di traduzione."""
from collections.abc import AsyncIterator
from typing import get_args

import pytest

from app.core.domain.prompts.templates import build_translate_messages
from app.core.domain.values import Language
from app.core.services.translate import translate
from tests.conftest import DummyLLMClient

TEXT = "Il mare d'inverno e' un concetto che il pensiero non considera."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


async def test_translate_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(translate(TEXT, "inglese", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


@pytest.mark.parametrize("target_language", get_args(Language))
async def test_translate_passes_the_built_messages_to_the_port(
    target_language: Language,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(translate(TEXT, target_language, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_translate_messages(
        TEXT, target_language
    )


async def test_translate_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = translate(TEXT, "inglese", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
