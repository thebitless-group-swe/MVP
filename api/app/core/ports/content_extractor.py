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
            Il contenuto testuale estratto dalla pagina.

            La porta non garantisce alcun limite di lunghezza. Il troncamento
            a `MAX_CHARS` è policy di `TavilyExtractor`, non del contratto:
            prometterlo qui significherebbe dichiarare una postcondizione che
            nessun altro adattatore — né un doppio nei test — è tenuto a
            rispettare, e chi consuma la porta si fiderebbe di una garanzia
            che non esiste.

        Raises:
            ContentExtractorError: Se l'estrazione fallisce (rete, permessi, contenuto vuoto, ecc.).
        """
        pass
