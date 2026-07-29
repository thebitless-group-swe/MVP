from collections.abc import AsyncIterator
#Generatore di log
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
#Risposta ufficiale di FastApi, accetta un async generator
#Gestisce autonomamente il chunked transfer-encoding HTTP
from fastapi.responses import StreamingResponse

from ..schemas import TextRequest
from ..llm import get_llm_client
from ..llm.client import LLMClient
from ..llm.errors import LLMProviderError
from ..llm.prompts import build_summarize_messages

router = APIRouter(prefix="/api", tags=["summarize"])

logger = logging.getLogger(__name__)

#Messaggio vincolato da UC 62: non modificare, tradurre o abbreviare.
_SERVICE_UNAVAILABLE_DETAIL = "Servizio temporaneamente non disponibile"

@router.post("/summarize")
async def summarize(
    #Separiamo il reale contenuto dalla richiesta HTTP di fastAPI
    payload: TextRequest,
    request: Request,
    #Depends permette di aspettare prima di chiamare la funzione desiderata
    client: LLMClient = Depends(get_llm_client),
) -> StreamingResponse:
    messages = build_summarize_messages(payload.text, payload.length)
    stream = client.stream(messages)

    #Consumiamo il primo chunk QUI, prima di restituire StreamingResponse.
    #Starlette invia http.response.start (status 200) PRIMA di iterare il
    #generatore: dopo non e' piu' possibile rispondere 503. Un LLMProviderError
    #"early" (es. auth/HTTP error del provider, sollevato prima del primo
    #chunk) viene cosi' intercettato e convertito in 503 dal route body.
    try:
        first_chunk = await anext(stream)
        stream_exhausted = False
    except StopAsyncIteration:
        #Stream vuoto ma valido: nessun chunk, solo marker di fine.
        first_chunk = None
        stream_exhausted = True
    except LLMProviderError:
        logger.exception("Errore provider LLM durante apertura stream riassunto")
        await stream.aclose()
        raise HTTPException(
            status_code=503,
            detail=_SERVICE_UNAVAILABLE_DETAIL,
        )

    async def event_stream() -> AsyncIterator[str]:
        try:
            if not stream_exhausted:
                #Il primo chunk e' gia' stato letto: emettilo (salvo disconnessione).
                if await request.is_disconnected():
                    logger.info("Client disconnesso, chiudo stream riassunto")
                    return
                #Stringa formattata SSE; "\n\n" separa gli eventi, standard SSE
                yield f"data: {first_chunk}\n\n"

                async for chunk in stream:
                    if await request.is_disconnected():
                        logger.info("Client disconnesso, chiudo stream riassunto")
                        return
                    yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except LLMProviderError:
            #Errore mid-stream: gli header (200) sono gia' partiti, non e'
            #possibile rispondere 503. Logghiamo server-side e chiudiamo in
            #modo pulito, senza propagare stacktrace/dettagli al client.
            logger.exception("Errore provider LLM durante stream riassunto")
            return
        finally:
            await stream.aclose()
        
    #event-stream setta l'header in maniera che identifichi l'SSE, lo processa a chunk
    return StreamingResponse(event_stream(), media_type="text/event-stream")
