from tavily import TavilyClient

from ...core.ports.content_extractor import ContentExtractor, ContentExtractorError
from ...settings import get_settings

# Costante di configurazione (potrebbe spostarsi in Settings)
MAX_CHARS = 12_000


class TavilyExtractor(ContentExtractor):
    """Adattatore concreto per l'estrazione di contenuto tramite Tavily."""

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or get_settings().tavily_api_key
        if not self._api_key:
            raise ContentExtractorError("TAVILY_API_KEY non configurata")
        self._client = TavilyClient(api_key=self._api_key)

    async def extract(self, url: str) -> str:
        """Estrae contenuto da URL usando Tavily."""
        try:
            # Tavily è sincrono, ma lo eseguiamo in un thread per non bloccare l'event loop
            response = self._client.extract(
                urls=url,
                extract_depth="basic",
                format="text",
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
