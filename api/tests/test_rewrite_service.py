"""Test unitario dello use case di riscrittura.

Segue la struttura fissata dal pilota in test_summarize_service.py: nessun
`TestClient`, nessun adattatore, nessuna rete. Il contenuto dei messaggi e'
coperto da test_ai_prompts.py, la formattazione SSE da test_streaming_helper.py:
qui resta il solo cablaggio fra lo use case e la porta.
"""
from collections.abc import AsyncIterator

import pytest

from app.core.domain.values import Style
from app.core.services.rewrite import rewrite
from app.llm.prompts import STYLE_INSTRUCTIONS, build_rewrite_messages
from tests.conftest import DummyLLMClient

TEXT = "Il mare d'inverno e' un concetto che il pensiero non considera."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


# Lo use case delega alla porta e non tocca i chunk: quelli emessi dal client
# arrivano al chiamante nello stesso ordine e senza trasformazioni.
async def test_rewrite_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(rewrite(TEXT, "formale", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


# Alla porta arrivano esattamente i messaggi che il builder produce per quel
# testo e quello stile. La parametrizzazione su tutti e tre i registri serve ad
# accorgersi di un parametro perso per strada: con uno stile solo, uno use case
# che ignora `style` passerebbe lo stesso.
@pytest.mark.parametrize("style", list(STYLE_INSTRUCTIONS.keys()))
async def test_rewrite_passes_the_built_messages_to_the_port(
    style: Style,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(rewrite(TEXT, style, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_rewrite_messages(TEXT, style)


# Lo stream torna freddo: lo use case non consuma la porta al posto del
# chiamante. Se bufferizzasse i chunk, il primo arriverebbe all'utente solo a
# riscrittura finita e `sse_response` non potrebbe piu' intercettare un errore
# "early" mentre puo' ancora rispondere 503.
async def test_rewrite_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = rewrite(TEXT, "formale", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
