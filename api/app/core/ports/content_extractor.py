from abc import ABC, abstractmethod


class ContentExtractorError(Exception):
    """Errore durante l'estrazione del contenuto da un URL."""
    pass


class ContentExtractor(ABC):
    """Porta per l'estrazione di contenuto testuale da URL."""
    
    @abstractmethod
    async def extract(self, url: str) -> str:
        """
        Estrae il contenuto testuale da un URL.

        Args:
            url: L'URL da cui estrarre il contenuto.

        Returns:
            Il contenuto testuale estratto (troncato a MAX_CHARS).

        Raises:
            ContentExtractorError: Se l'estrazione fallisce (rete, permessi, contenuto vuoto, ecc.).
        """
        pass