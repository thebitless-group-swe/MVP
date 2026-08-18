from abc import ABC, abstractmethod


class ContentExtractorError(Exception):
    """Errore durante l'estrazione del contenuto da un URL."""
    pass


class ContentExtractor(ABC):
    """Porta per l'estrazione di contenuto testuale da URL."""

    @abstractmethod
    async def extract(self, url: str) -> str:
        """Estrae il contenuto testuale da un URL.

        La porta non promette limiti di lunghezza, il taglio a MAX_CHARS lo
        fa TavilyExtractor per scelta sua.
        """
        pass
