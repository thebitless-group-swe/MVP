"""Test B-01: helper unico per lo streaming SSE (infrastructure/adapters/sse_streaming.py)."""
from collections.abc import AsyncIterator, Sequence

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.domain.values import Message
from app.core.ports.llm_client import LLMClient, LLMProviderError
from app.dependencies import get_llm_client
from app.infrastructure.adapters.litellm_client import LiteLLMClient
from app.infrastructure.adapters.sse_streaming import (
    SERVICE_UNAVAILABLE_DETAIL,
    SSE_ERROR_EVENT,
    sse_response,
)
from app.main import app
from app.settings import Settings

VALID_TEXT = "Un testo abbastanza lungo per superare la validazione di schema."

SENTINEL_SECRET = "sk-SECRET-SENTINEL-12345"


class TrackedStream:
    """Stream finto che registra se aclose() e' stato invocato."""

    def __init__(self, chunks: list[str], raise_after: int | None = None) -> None:
        self._chunks = chunks
        self._raise_after = raise_after
        self._index = 0
        self.closed = False

    def __aiter__(self) -> "TrackedStream":
        return self

    async def __anext__(self) -> str:
        if self._raise_after is not None and self._index == self._raise_after:
            raise LLMProviderError(f"Errore provider con chiave {SENTINEL_SECRET}")
        if self._index >= len(self._chunks):
            raise StopAsyncIteration
        chunk = self._chunks[self._index]
        self._index += 1
        return chunk

    async def aclose(self) -> None:
        self.closed = True


class _ConnectedRequest:
    """Request finta sempre connessa."""

    async def is_disconnected(self) -> bool:
        return False


class _DisconnectedRequest:
    """Request finta sempre disconnessa."""

    async def is_disconnected(self) -> bool:
        return True


async def _collect(response) -> str:
    return "".join([part async for part in response.body_iterator])


async def test_empty_stream_emits_only_done_marker() -> None:
    stream = TrackedStream([])

    response = await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]
    body = await _collect(response)

    assert body == "data: [DONE]\n\n"
    assert stream.closed


async def test_chunks_are_formatted_as_sse_events() -> None:
    stream = TrackedStream(["alfa", "beta"])

    response = await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]
    body = await _collect(response)

    assert body == "data: alfa\n\ndata: beta\n\ndata: [DONE]\n\n"


# Un chunk multiriga richiede una riga `data:` per ogni riga del contenuto: il
# valore di un campo SSE non puo' contenere a capo. Con il formato precedente
# le righe successive alla prima perdevano il prefisso e il client le scartava.
async def test_multiline_chunk_becomes_one_data_line_per_line() -> None:
    stream = TrackedStream(["# Titolo\n\n- uno\n- due"])

    response = await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]
    body = await _collect(response)

    assert body == (
        "data: # Titolo\n"
        "data: \n"
        "data: - uno\n"
        "data: - due\n"
        "\n"
        "data: [DONE]\n\n"
    )


# Un chunk che e' solo un a capo produce due righe `data:` vuote: e' l'evento
# che nel formato precedente spariva del tutto.
async def test_newline_only_chunk_survives() -> None:
    stream = TrackedStream(["\n"])

    response = await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]
    body = await _collect(response)

    assert body == "data: \ndata: \n\ndata: [DONE]\n\n"


# Il contenuto generato dall'LLM puo' somigliare a un campo SSE. Deve viaggiare
# come valore di `data:`, cosi' che il client -- che fa dispatch sul nome del
# campo -- lo consegni all'utente come testo e non come errore.
async def test_chunk_that_looks_like_an_event_field_travels_as_data() -> None:
    stream = TrackedStream(["event: error"])

    response = await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]
    body = await _collect(response)

    assert body == "data: event: error\n\ndata: [DONE]\n\n"
    assert not body.startswith("event:")


async def test_provider_error_before_first_chunk_raises_503() -> None:
    stream = TrackedStream(["alfa"], raise_after=0)

    with pytest.raises(HTTPException) as exc_info:
        await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == SERVICE_UNAVAILABLE_DETAIL
    assert stream.closed


async def test_disconnected_client_closes_stream_without_emitting() -> None:
    stream = TrackedStream(["alfa", "beta"])

    response = await sse_response(_DisconnectedRequest(), stream, "test")  # type: ignore[arg-type]
    body = await _collect(response)

    assert body == ""
    assert stream.closed


async def test_stream_is_closed_after_normal_completion() -> None:
    stream = TrackedStream(["alfa"])

    response = await sse_response(_ConnectedRequest(), stream, "test")  # type: ignore[arg-type]
    await _collect(response)

    assert stream.closed


# End-to-end sulla cattura reale del gateway LiteLLM: la fixture contiene un
# chunk che e' un solo a capo (riga 5), cioe' proprio il caso che il formato
# precedente faceva sparire. Percorso completo LiteLLMClient -> sse_response.
async def test_real_fixture_preserves_the_newline_chunk(sse_chunks: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=sse_chunks.encode())

    client = LiteLLMClient(Settings())
    client._client = httpx.AsyncClient(
        base_url=client._settings.litellm_base_url,
        transport=httpx.MockTransport(handler),
    )

    response = await sse_response(
        _ConnectedRequest(),  # type: ignore[arg-type]
        client.stream([Message(role="user", content="x")]),
        "test",
    )
    body = await _collect(response)
    await client.aclose()

    # I chunk della fixture sono ["Ciao", " mondo", "\n"].
    assert body == (
        "data: Ciao\n\n"
        "data:  mondo\n\n"
        "data: \ndata: \n\n"
        "data: [DONE]\n\n"
    )
    # Il terzo evento esiste e non e' scomparso, come invece accadeva prima.
    assert "data: \ndata: \n\n" in body


class _MidStreamErrorClient(LLMClient):
    """Emette un chunk valido, poi fallisce a meta' stream."""

    async def stream(self, messages: Sequence[Message]) -> AsyncIterator[str]:
        yield "parziale"
        raise LLMProviderError(f"Errore provider con chiave {SENTINEL_SECRET}")


class TestMidStreamError:
    @pytest.fixture(autouse=True)
    def _override_llm_client(self):
        app.dependency_overrides[get_llm_client] = lambda: _MidStreamErrorClient()
        yield
        app.dependency_overrides.clear()

    #Gli header (200) sono gia' partiti quando il provider fallisce, quindi lo
    #status non puo' cambiare: cio' che distingue il fallimento e' l'evento
    #terminale nel corpo. Prima di #03 questo test asseriva la sola ASSENZA di
    #[DONE], cioe' certificava come corretto un errore indistinguibile da una
    #chiusura riuscita -- lo stesso difetto che l'analisi rimprovera altrove ai
    #test che ratificano invece di intercettare.
    def test_mid_stream_error_emits_terminal_error_event(
        self, client: TestClient
    ) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        assert response.status_code == 200
        assert "data: parziale\n\n" in response.text
        #Il fallimento e' dichiarato, non desumibile dall'assenza di [DONE]
        assert response.text.endswith(SSE_ERROR_EVENT)
        assert "event: error\n" in response.text
        assert SERVICE_UNAVAILABLE_DETAIL in response.text
        #E resta distinguibile dal successo
        assert "[DONE]" not in response.text

    def test_mid_stream_error_does_not_leak_details(
        self, client: TestClient
    ) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        assert SENTINEL_SECRET not in response.text
        assert "Traceback" not in response.text
        assert "LLMProviderError" not in response.text


class TestRoutesShareTheHelper:
    """Le tre route storiche si comportano in modo identico."""

    @pytest.fixture(autouse=True)
    def _override_llm_client(self, dummy_llm_client):
        app.dependency_overrides[get_llm_client] = lambda: dummy_llm_client
        yield
        app.dependency_overrides.clear()

    @pytest.mark.parametrize(
        ("path", "payload"),
        [
            ("/api/summarize", {"text": VALID_TEXT}),
            ("/api/generate", {"prompt": "Scrivi un testo sul mare"}),
        ],
    )
    def test_route_terminates_with_done_marker(
        self, client: TestClient, path: str, payload: dict
    ) -> None:
        response = client.post(path, json=payload)

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.text.endswith("data: [DONE]\n\n")
