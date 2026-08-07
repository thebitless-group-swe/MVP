import asyncio

from tavily import TavilyClient

from ...core.ports.content_extractor import ContentExtractor, ContentExtractorError

# Costante di configurazione (potrebbe spostarsi in Settings)
MAX_CHARS = 12_000


class TavilyExtractor(ContentExtractor):
    """Adattatore concreto per l'estrazione di contenuto tramite Tavily."""

    def __init__(self, api_key: str):
        #La chiave arriva da chi costruisce l'adattatore: leggerla qui da
        #`get_settings()` legava una classe di infrastruttura alla
        #configurazione globale, e rendeva impossibile istanziarla nei test
        #senza toccare l'ambiente.
        if not api_key:
            raise ContentExtractorError("TAVILY_API_KEY non configurata")
        self._api_key = api_key
        self._client = TavilyClient(api_key=api_key)

    async def aclose(self) -> None:
        """Chiude la sessione HTTP di Tavily (da invocare allo shutdown dell'app).

        `TavilyClient` tiene una `requests.Session`, quindi un pool di connessioni
        che sopravvive alla singola estrazione. Da quando il provider e' un
        singleton `@lru_cache` quel pool resta aperto per l'intera vita del
        processo, esattamente come quello di `LiteLLMClient`.

        `close()` e' sincrono ma non fa I/O di rete: smonta il pool locale. Per
        questo, a differenza di `extract`, non passa da `asyncio.to_thread`. Il
        metodo e' comunque `async` per presentare al lifespan la stessa forma
        dell'adattatore LLM.
        """
        self._client.close()

    async def extract(self, url: str) -> str:
        """Estrae contenuto da URL usando Tavily."""
        try:
            # `TavilyClient.extract` fa I/O di rete in modo sincrono. Chiamarlo
            # direttamente da una coroutine fermerebbe l'event loop per l'intera
            # durata della richiesta: non solo questa estrazione, ma ogni altra
            # richiesta in corso — compresi gli stream SSE già aperti — resterebbe
            # ferma. `to_thread` lo sposta sul thread pool e restituisce il
            # controllo al loop mentre la rete lavora.
            response = await asyncio.to_thread(
                self._client.extract, urls=url, extract_depth="basic", format="text"
            )
        except Exception as exc:
            raise ContentExtractorError(f"Errore durante l'estrazione: {exc}") from exc

        results = response.get("results", [])
        if not results:
            raise ContentExtractorError(
                "Nessun contenuto estraibile: la pagina potrebbe non esistere o essere vuota"
            )

        content = results[0].get("raw_content", "")
        if not content:
            raise ContentExtractorError("Nessun contenuto estraibile: la pagina non contiene testo")

        return content[:MAX_CHARS]
