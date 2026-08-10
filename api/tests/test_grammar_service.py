"""Test unitario dello use case di correzione grammaticale.

Segue la struttura fissata dal pilota in test_summarize_service.py: nessun
`TestClient`, nessun adattatore, nessuna rete. Il contenuto dei messaggi e'
coperto da test_ai_prompts.py, la formattazione SSE da test_streaming_helper.py:
qui resta il solo cablaggio fra lo use case e la porta.

Nota sulla parametrizzazione, presente nei tre fratelli e assente qui: negli
altri use case serve ad accorgersi di un parametro perso per strada, perche' un
servizio che ignorasse `length` passerebbe comunque sul default del builder.
`build_grammar_messages` ha un solo argomento, e il confronto sui messaggi
ricevuti intercetta gia' un `text` perso: una parametrizzazione qui non
verificherebbe nulla in piu'.
"""
from collections.abc import AsyncIterator

from app.core.domain.prompts.templates import build_grammar_messages
from app.core.services.grammar import grammar
from tests.conftest import DummyLLMClient

TEXT = "Un testo abbastanza lungo da poter contenere qualche errore di ortografia."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


# Lo use case delega alla porta e non tocca i chunk: quelli emessi dal client
# arrivano al chiamante nello stesso ordine e senza trasformazioni.
async def test_grammar_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(grammar(TEXT, dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


# Alla porta arrivano esattamente i messaggi che il builder produce per quel
# testo: e' il cablaggio vero e proprio fra lo use case e la porta.
async def test_grammar_passes_the_built_messages_to_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(grammar(TEXT, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_grammar_messages(TEXT)


# Lo stream torna freddo: lo use case non consuma la porta al posto del
# chiamante. Se bufferizzasse i chunk, il primo arriverebbe all'utente solo a
# correzione finita e `sse_response` non potrebbe piu' intercettare un errore
# "early" mentre puo' ancora rispondere 503.
async def test_grammar_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = grammar(TEXT, dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
