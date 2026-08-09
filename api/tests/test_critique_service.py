"""Test unitario dello use case di analisi critica.

Segue la struttura fissata dal pilota in test_summarize_service.py: nessun
`TestClient`, nessun adattatore, nessuna rete. Il caso d'uso si invoca
passandogli `DummyLLMClient` — un doppio della sola porta `LLMClient` — e cio'
che si verifica e' il solo cablaggio fra lo use case e la porta.

Divisione delle responsabilita' con i test vicini, la stessa degli altri sei use
case: il *contenuto* dei messaggi — sei system prompt distinti, le parole chiave
di ciascun cappello, l'assenza di leak del testo utente nel system — e' del
prompt builder ed e' coperto in test_ai_prompts.py, e qui non va riverificato;
la formattazione SSE e la gestione del 503 sono dell'adattatore di trasporto e
sono coperte in test_streaming_helper.py e test_exception_503.py.
"""
from collections.abc import AsyncIterator
from typing import get_args

import pytest

from app.core.domain.values import Hat
from app.core.services.critique import critique
from app.llm.prompts import build_critique_messages
from tests.conftest import DummyLLMClient

TEXT = "Il progetto raddoppiera' il fatturato entro sei mesi, senza assumere nessuno."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


# Il cablaggio vero e proprio: alla porta arrivano esattamente i messaggi che il
# builder produce per quel testo e quel cappello. La parametrizzazione su tutti e
# sei e' cio' che rende il test capace di accorgersi di un parametro perso per
# strada: con un cappello solo, uno use case che ignora `hat` passerebbe lo
# stesso.
@pytest.mark.parametrize("hat", list(get_args(Hat)))
async def test_critique_passes_the_built_messages_to_the_port(
    hat: Hat,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(critique(TEXT, hat, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_critique_messages(TEXT, hat)


# Lo use case delega alla porta e non tocca i chunk: quelli emessi dal client
# arrivano al chiamante nello stesso ordine e senza trasformazioni.
async def test_critique_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(critique(TEXT, "nero", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


# Lo stream torna freddo: lo use case non consuma la porta al posto del
# chiamante. Se bufferizzasse i chunk, il primo arriverebbe all'utente solo ad
# analisi finita e `sse_response` non potrebbe piu' intercettare un errore
# "early" mentre puo' ancora rispondere 503.
async def test_critique_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = critique(TEXT, "nero", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
