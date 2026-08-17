"""Test del LiteLLMClient: configurazione httpx, parsing SSE e mapping errori.

Le richieste di rete sono sempre intercettate da httpx.MockTransport: nessun
test tocca la rete reale. La fixture SSE (api/tests/fixtures/litellm_sse.txt)
è una cattura reale dal gateway LiteLLM, usata per validare il parsing.
"""

import json
from collections.abc import Callable

import httpx
import pytest

from app.core.domain.values import Message
from app.core.ports.llm_client import LLMProviderError
from app.infrastructure.adapters.litellm_client import (
    CONNECT_TIMEOUT_SECONDS,
    READ_TIMEOUT_SECONDS,
    LiteLLMClient,
)
from app.settings import Settings

#Il dominio parla di Message: la forma a dizionario compare solo nel
#payload che l'adattatore costruisce, ed e' quella che
#test_stream_invia_payload_corretto verifica.
MESSAGES = [Message(role="user", content="Riassumi questo testo.")]
PAYLOAD_MESSAGES = [{"role": "user", "content": "Riassumi questo testo."}]


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> LiteLLMClient:
    """LiteLLMClient con trasporto httpx finto: le richieste non escono in rete."""
    client = LiteLLMClient(Settings())
    client._client = httpx.AsyncClient(
        base_url=client._settings.litellm_base_url,
        transport=httpx.MockTransport(handler),
    )
    return client


# --- #13 (POC-B-05): __init__ e setup httpx -------------------------------


async def test_init_configura_client_httpx() -> None:
    settings = Settings(
        litellm_base_url="http://litellm:4000/v1",
        litellm_model="gemma3:1b",
        litellm_api_key="chiave-segreta",
    )
    client = LiteLLMClient(settings)

    # httpx normalizza la base_url aggiungendo lo slash finale.
    assert str(client._client.base_url) == "http://litellm:4000/v1/"
    # httpx normalizza la chiave header in minuscolo.
    assert client._client.headers["authorization"] == "Bearer chiave-segreta"
    assert client._client.timeout.read == READ_TIMEOUT_SECONDS
    assert client._client.timeout.connect == CONNECT_TIMEOUT_SECONDS

    await client.aclose()


# I due timeout misurano guasti diversi e non possono avere lo stesso valore.
# La connessione o si apre subito o il gateway non c'e': attenderla quanto si
# attende un modello che genera vorrebbe dire tenere l'utente fermo per minuti
# davanti a un servizio spento. La lettura, all'opposto, misura la pausa fra due
# chunk, e con un modello grande la prima puo' durare piu' di un minuto: e' il
# guasto che il valore unico di 60 s trasformava in un 503 su una richiesta che
# stava solo andando piano.
def test_la_lettura_attende_piu_a_lungo_della_connessione() -> None:
    assert CONNECT_TIMEOUT_SECONDS < READ_TIMEOUT_SECONDS


async def test_aclose_chiude_il_client() -> None:
    client = LiteLLMClient(Settings())

    assert client._client.is_closed is False
    await client.aclose()
    assert client._client.is_closed is True


# --- #14 (POC-B-06): stream() parsing SSE ---------------------------------


async def test_stream_yielda_solo_delta_content(sse_chunks: str) -> None:
    """Usa la fixture SSE reale: estrae i content, ignora finish chunk e [DONE]."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=sse_chunks.encode())

    client = make_client(handler)
    chunks = [chunk async for chunk in client.stream(MESSAGES)]

    assert chunks == ["Ciao", " mondo", "\n"]
    assert "".join(chunks) == "Ciao mondo\n"
    await client.aclose()


async def test_stream_invia_payload_corretto() -> None:
    """Verifica model, messages e stream=true nel body della richiesta."""
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, content=b"data: [DONE]\n\n")

    client = make_client(handler)
    client._settings.litellm_model = "gemma3:1b"
    _ = [chunk async for chunk in client.stream(MESSAGES)]

    assert captured["payload"] == {
        "model": "gemma3:1b",
        "messages": PAYLOAD_MESSAGES,
        "stream": True,
    }
    await client.aclose()


# UC67.3 passo 3: il tetto scelto dallo use case arriva al provider come
# `max_tokens`. E' l'unico punto in cui una decisione di dominio prende il nome
# che ha nel protocollo del fornitore, ed e' qui che si verifica.
async def test_stream_invia_max_tokens_quando_lo_use_case_lo_chiede() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, content=b"data: [DONE]\n\n")

    client = make_client(handler)
    _ = [chunk async for chunk in client.stream(MESSAGES, max_tokens=640)]

    assert captured["payload"]["max_tokens"] == 640
    await client.aclose()


# Il contrario, ed e' la meta' che conta: per le quattro funzioni che riscrivono
# un testo esistente la chiave non deve comparire affatto. Inviarla a zero, o a
# un default qualunque, troncherebbe l'output; ometterla lascia decidere al
# provider, che e' il comportamento voluto.
async def test_stream_omette_del_tutto_max_tokens_quando_non_richiesto() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, content=b"data: [DONE]\n\n")

    client = make_client(handler)
    _ = [chunk async for chunk in client.stream(MESSAGES)]

    assert "max_tokens" not in captured["payload"]
    await client.aclose()


# --- #15 (POC-B-07): mapping errori -> LLMProviderError -------------------


async def test_stream_mappa_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("troppo lento", request=request)

    client = make_client(handler)
    with pytest.raises(LLMProviderError):
        _ = [chunk async for chunk in client.stream(MESSAGES)]
    await client.aclose()


async def test_stream_mappa_errore_5xx() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, content=b"")

    client = make_client(handler)
    client._settings.litellm_api_key = "sk-chiave-segreta"
    with pytest.raises(LLMProviderError) as exc_info:
        _ = [chunk async for chunk in client.stream(MESSAGES)]
    # Nessun leak della chiave API nel messaggio d'errore.
    assert client._settings.litellm_api_key not in str(exc_info.value)
    await client.aclose()


async def test_stream_mappa_sse_malformata() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"data: {non-json}\n\n")

    client = make_client(handler)
    with pytest.raises(LLMProviderError):
        _ = [chunk async for chunk in client.stream(MESSAGES)]
    await client.aclose()
