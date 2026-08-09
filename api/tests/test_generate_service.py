"""Test unitario dello use case di generazione.

Segue la struttura fissata dal pilota in test_summarize_service.py: nessun
`TestClient`, nessun adattatore, nessuna rete. Il contenuto dei messaggi e'
coperto da test_prompts.py, la formattazione SSE da test_streaming_helper.py:
qui resta il solo cablaggio fra lo use case e la porta.
"""
from collections.abc import AsyncIterator

import pytest

from app.core.domain.values import Length
from app.core.services.generate import generate
from app.llm.prompts import LENGTH_INSTRUCTIONS, build_generate_messages
from tests.conftest import DummyLLMClient

PROMPT = "Scrivi un testo sul mare d'inverno, con qualche riferimento a Battiato."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


# Lo use case delega alla porta e non tocca i chunk: quelli emessi dal client
# arrivano al chiamante nello stesso ordine e senza trasformazioni.
async def test_generate_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(generate(PROMPT, "medio", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


# Alla porta arrivano esattamente i messaggi che il builder produce per quel
# prompt e quella lunghezza. La parametrizzazione serve ad accorgersi di un
# parametro perso per strada: ignorare `length` passerebbe comunque su "medio",
# che e' il default del builder.
@pytest.mark.parametrize("length", list(LENGTH_INSTRUCTIONS.keys()))
async def test_generate_passes_the_built_messages_to_the_port(
    length: Length,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(generate(PROMPT, length, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_generate_messages(PROMPT, length)


# Lo stream torna freddo: lo use case non consuma la porta al posto del
# chiamante. Se bufferizzasse i chunk, il primo arriverebbe all'utente solo a
# generazione finita e `sse_response` non potrebbe piu' intercettare un errore
# "early" mentre puo' ancora rispondere 503.
async def test_generate_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = generate(PROMPT, "medio", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
