import asyncio
import logging
import warnings
from collections.abc import AsyncIterator, Sequence

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.domain.values import Message
from app.core.ports.llm_client import LLMClient
from app.dependencies import get_llm_client
from app.main import app
from tests.conftest import DummyLLMClient


#Sostituisce il LiteLLMClient con il dummy prima di OGNI test (autouse=True)
#Una volta finito lo rimuove
@pytest.fixture(autouse=True)
def _override_llm_client():
    #Sostituisce il LiteLLMClient con il dummy, utile per test pre implementazione
    app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient()
    yield
    #Cancella il dummy DOPO il test (teardown)
    app.dependency_overrides.clear()

def test_returns_200_and_sse_content_type(client: TestClient) -> None:
    response = client.post(
        "/api/summarize",
        json={
            "text": "Un testo abbastanza lungo per fare test test. Lorem ipsum dolor sit amet.",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

def test_streams_dummy_chunks_in_sse_format(client: TestClient) -> None:
    response = client.post(
        "/api/summarize",
        json = {
            "text": "Testo abbastanza lungo, lorem ipsum dolor sit amet",
        }
    )

    body = response.text

    assert "data: chunk1 \n\n" in body
    assert "data: chunk2 \n\n" in body
    assert "data: fine\n\n" in body

def test_terminates_with_done_marker(client: TestClient) -> None:
    response = client.post(
        "/api/summarize",
        json = {
            "text": "Testo abbastanza lungo, lorem ipsum dolor sit amet",
        }
    )

    assert response.text.endswith("data: [DONE]\n\n")

def test_validation_error_on_short_text(client: TestClient) -> None:
    response = client.post("/api/summarize", json={"text": "corto"})

    assert response.status_code == 422

def test_endpoint_uses_injected_client() -> None:
    dummy_chunks = ["AAA", "BBB"]
    app.dependency_overrides[get_llm_client] = lambda: DummyLLMClient(dummy_chunks)
    client = TestClient(app)

    response = client.post(
        "/api/summarize",
        json = {
            "text": "Testo abbastanza lungo, lorem ipsum dolor sit amet"
        }
    )

    body = response.text
    assert "data: AAA\n\n" in body
    assert "data: BBB\n\n" in body
    assert body.endswith("data: [DONE]\n\n")
    #chunk1 (default del dummyLLMClient) non deve essere presente
    assert "chunk1" not in body

    app.dependency_overrides.clear()

#Classe che simula un LLMClient con una debole connessione
class SlowDummyLLMClient(LLMClient):
    CHUNKS = ["a", "b", "c", "d", "e", "f", "g", "h"]

    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        for chunk in self.CHUNKS:
            await asyncio.sleep(0.05)
            yield chunk

#Fake Request che si dichiara sempre disconnesso.
#Usato per testare il path "soft disconnect" della route senza HTTP.
class _DisconnectedRequest:
    async def is_disconnected(self) -> bool:
        return True


@pytest.mark.asyncio
async def test_disconnect_emits_log(caplog) -> None:
    from app.api.routes.summarize import summarize
    from app.api.schemas import TextRequest

    caplog.set_level(logging.INFO, logger="app.api.routes.summarize")

    response = await summarize(
        payload=TextRequest(text="Testo abbastanza lungo, Lorem Ipsum dolor sit amet"),
        request=_DisconnectedRequest(),  # type: ignore[arg-type]
        client=SlowDummyLLMClient(),
    )

    #Consuma l'async generator di StreamingResponse per attivare event_stream.
    #Il generator dovrebbe uscire subito dopo il primo chunk (is_disconnected → True).
    async for _ in response.body_iterator:
        pass

    assert any(
        "Client disconnesso" in rec.message
        for rec in caplog.records
    )

@pytest.mark.asyncio
async def test_disconnects_does_not_leave_pending_tasks() -> None:
    app.dependency_overrides[get_llm_client] = lambda: SlowDummyLLMClient()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            async with ac.stream(
                "POST",
                "/api/summarize",
                json={
                    "text": "Testo abbastanza lungo, Lorem ipsum dolor sit amet",
                }
            ) as response:
                async for _ in response.aiter_bytes():
                    break

        await asyncio.sleep(0.2)

    pending = [
        w for w in caught
        if "task" in str(w.message).lower() and "pending" in str(w.message).lower()
    ]

    assert not pending, f"Trovati warning task pending: {pending}"
