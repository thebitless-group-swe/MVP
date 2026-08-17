from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Sequence

from ..domain.values import Message


class LLMProviderError(Exception):
    """Errore del provider LLM.

    Sta accanto alla porta e non nell'adattatore perche' fa parte del
    contratto: chi consuma `LLMClient` deve poterlo catturare senza sapere
    quale implementazione lo solleva. `streaming.py` lo cattura per rispondere
    503 (UC 62) e non conosce `LiteLLMClient`; se l'eccezione vivesse
    nell'adattatore, quel modulo dovrebbe importare l'infrastruttura per
    gestire un caso previsto dalla porta.

    La collocazione e' la stessa di `ContentExtractorError` rispetto a
    `ContentExtractor`: una convenzione sola per le due porte, cosi' che dove
    cercare l'errore di una porta non sia una domanda. L'alternativa —
    accorpare gli errori in un `core/ports/errors.py` — spezzerebbe in due file
    un contratto che si legge meglio intero.
    """

    pass


class LLMClient(ABC):
    """Porta per lo streaming di completamenti da un provider LLM."""

    @abstractmethod
    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        """Yield chunk testuali (delta.content) dal provider LLM.

        Il primo parametro e' una sequenza di `Message`, non di dizionari: la
        forma di filo del provider — le chiavi «role» e «content» — sta oltre la
        porta, dentro l'adattatore, che e' l'unico modulo autorizzato a
        conoscerla. `Sequence` e non `list` perche' la porta legge e non
        modifica: i template producono liste, i test possono passare tuple.

        `max_tokens` e' il tetto che UC67.3 passo 3 chiede di imporre alla
        chiamata. Sta **nella porta e non nell'adattatore** perche' non e' una
        costante di trasporto: dipende dalla lunghezza che l'utente ha scelto,
        cioe' da un dato di dominio, e solo lo use case la conosce. Il nome e'
        quello del protocollo OpenAI e non se ne discosta: inventarne un
        sinonimo di dominio avrebbe aggiunto una traduzione senza aggiungere
        una decisione.

        Il default `None` e' la meta' che conta. Le quattro funzioni che
        riscrivono un testo gia' esistente — traduzione, riscrittura,
        correzione, analisi — non passano nulla, e la chiave non deve comparire
        affatto nella richiesta: un tetto li' troncherebbe l'output di un input
        lungo a meta' frase, e lo stream terminerebbe in modo indistinguibile
        da un completamento riuscito. Quale funzione chieda il tetto e quale no
        e' fissato da `tests/test_token_budget.py`.

        La porta non dichiara `aclose`: la chiusura di eventuali risorse di
        trasporto e' un dettaglio dell'adattatore, e il lifespan la richiede
        solo a chi la espone (vedi `main.py`).

        Raises:
            LLMProviderError: se il provider e' irraggiungibile, va in timeout,
                risponde con uno stato di errore o emette una risposta
                malformata.
        """
        ...
