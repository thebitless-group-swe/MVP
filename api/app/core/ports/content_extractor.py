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

            Il residuo, dichiarato e non pagato in anticipo: nessun vincolo di
            dominio limita oggi il contenuto estratto da link. `LinkRequest`
            porta un URL e non del testo, quindi il `max_length` sui DTO
            previsto dalla #33 non raggiunge questo percorso, e l'unico argine
            resta la costante privata dell'adattatore. Il cap appartiene al
            dominio: va con la #33, con la costante in `core/domain/values.py`
            (#11).

        Raises:
            ContentExtractorError: Se l'estrazione fallisce (rete, permessi, contenuto vuoto, ecc.).
        """
        pass
