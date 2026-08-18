import asyncio

from tavily import TavilyClient

from ...core.ports.content_extractor import ContentExtractor, ContentExtractorError

MAX_CHARS = 12_000


class TavilyExtractor(ContentExtractor):
    """Adattatore concreto per l'estrazione di contenuto tramite Tavily."""

    def __init__(self, api_key: str):
        if not api_key:
            raise ContentExtractorError("TAVILY_API_KEY non configurata")
        self._api_key = api_key
        self._client = TavilyClient(api_key=api_key)

    async def aclose(self) -> None:
        """Chiude la sessione HTTP di Tavily, va invocata allo shutdown dell'app."""
        self._client.close()

    async def extract(self, url: str) -> str:
        try:
            #extract di Tavily fa rete in modo sincrono, va spostato su un
            #thread o blocca l'event loop e con lui tutti gli stream aperti.
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
