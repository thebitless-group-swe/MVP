"""Test unitario dello use case di riassunto.

Pilota della struttura dei test dei sette use case: niente `TestClient`, nessun
adattatore, nessuna rete. Si invoca la funzione passandole `DummyLLMClient` — un
doppio della sola porta `LLMClient` — e si verifica cio' che lo use case fa: che
i messaggi consegnati alla porta siano quelli costruiti dai dati ricevuti, e che
lo stream della porta arrivi al chiamante invariato e ancora freddo. E' la
dimostrazione pratica del beneficio rivendicato dall'architettura: il caso d'uso
si prova senza montare HTTP.

Divisione delle responsabilita' con i test vicini, da tenere anche per gli altri
sei use case: il *contenuto* dei messaggi (ruoli, istruzione di lunghezza,
assenza di leak del testo utente nel system prompt) e' del prompt builder ed e'
coperto in test_prompts.py; la formattazione SSE e la gestione del 503 sono
dell'adattatore di trasporto e sono coperte in test_streaming_helper.py e
test_exception_503.py. Qui resta il solo cablaggio fra i due.
"""
from collections.abc import AsyncIterator

import pytest

from app.core.domain.values import Length
from app.core.services.summarize import summarize
from app.llm.prompts import LENGTH_INSTRUCTIONS, build_summarize_messages
from tests.conftest import DummyLLMClient

TEXT = "Un testo abbastanza lungo da poter essere riassunto. Lorem ipsum dolor sit amet."


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


# Lo use case delega alla porta e non tocca i chunk: quelli emessi dal client
# arrivano al chiamante nello stesso ordine e senza trasformazioni.
async def test_summarize_returns_the_chunks_yielded_by_the_port(
    dummy_llm_client: DummyLLMClient,
) -> None:
    chunks = await _collect(summarize(TEXT, "medio", dummy_llm_client))

    assert chunks == DummyLLMClient.DEFAULT_CHUNKS


# Il cablaggio vero e proprio: alla porta arrivano esattamente i messaggi che il
# builder produce per quel testo e quella lunghezza. La parametrizzazione sui
# tre valori e' cio' che rende il test capace di accorgersi di un parametro
# perso per strada: ignorare `length` passerebbe comunque su "medio", che e' il
# default del builder.
@pytest.mark.parametrize("length", list(LENGTH_INSTRUCTIONS.keys()))
async def test_summarize_passes_the_built_messages_to_the_port(
    length: Length,
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(summarize(TEXT, length, dummy_llm_client))

    assert dummy_llm_client.received_messages == build_summarize_messages(TEXT, length)


# Lo stream torna freddo: lo use case non consuma la porta al posto del
# chiamante. Se bufferizzasse i chunk per restituirli tutti insieme, il primo
# arriverebbe all'utente solo a generazione finita e `sse_response` non avrebbe
# piu' modo di intercettare un errore "early" mentre puo' ancora rispondere 503.
async def test_summarize_does_not_consume_the_port_before_the_caller(
    dummy_llm_client: DummyLLMClient,
) -> None:
    stream = summarize(TEXT, "medio", dummy_llm_client)

    assert dummy_llm_client.received_messages is None

    await _collect(stream)

    assert dummy_llm_client.received_messages is not None
