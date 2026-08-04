"""Test B-01: helper unico per lo streaming SSE (app/llm/streaming.py)."""
from collections.abc import AsyncIterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.llm import get_llm_client
from app.llm.client import LLMClient
from app.llm.errors import LLMProviderError
from app.llm.streaming import SERVICE_UNAVAILABLE_DETAIL, sse_response
from app.main import app

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


class _MidStreamErrorClient(LLMClient):
    """Emette un chunk valido, poi fallisce a meta' stream."""

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        yield "parziale"
        raise LLMProviderError(f"Errore provider con chiave {SENTINEL_SECRET}")


class TestMidStreamError:
    @pytest.fixture(autouse=True)
    def _override_llm_client(self):
        app.dependency_overrides[get_llm_client] = lambda: _MidStreamErrorClient()
        yield
        app.dependency_overrides.clear()

    def test_mid_stream_error_returns_truncated_200(self, client: TestClient) -> None:
        response = client.post("/api/summarize", json={"text": VALID_TEXT})

        assert response.status_code == 200
        assert "data: parziale\n\n" in response.text
        #Lo stream si interrompe prima del marker di fine
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
