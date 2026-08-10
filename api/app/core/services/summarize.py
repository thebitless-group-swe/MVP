"""Use case: riassumere un testo (UC 52).

Pilota dei sette use case dell'epica: la forma fissata qui e' quella che gli
altri sei seguono.

  - **Una funzione, non una classe.** L'unica dipendenza e' la porta, e la
    porta e' un parametro: una classe con `__init__` e un solo metodo `execute`
    offrirebbe la stessa iniezione e la stessa testabilita' in piu' righe.
  - **Un modulo per use case, chiamato come l'operazione** — `summarize.py`
    espone `summarize()` — cosi' come `generate_from_link.py` espone le proprie
    funzioni. La route importa la funzione con l'alias `<nome>_service` perche'
    il nome dell'handler non puo' cambiare: FastAPI ci deriva l'operationId
    esposto in openapi.json.
  - **La porta e' l'ultimo parametro**, dopo i dati del caso d'uso: si legge
    "riassumi questo testo, di questa lunghezza, tramite questo client".
  - **Il tipo del parametro e' la porta, mai l'adattatore.** Lo use case non sa
    se dall'altra parte c'e' LiteLLM o un doppio di test, e non lo scopre.
  - **Ritorna lo stream della porta senza consumarlo.** Chi chiama riceve un
    generatore ancora freddo: e' quello che permette a `sse_response` di
    estrarne il primo chunk per intercettare un errore "early" mentre puo'
    ancora rispondere 503 (UC 62), e all'utente di vedere il testo comparire a
    mano a mano invece che tutto insieme.

Tutti e tre gli import puntano ormai verso il centro: fino a poco fa i prompt
erano l'eccezione, perche' vivevano in `llm/prompts.py` e questo modulo doveva
uscire da `core/` per costruire il proprio messaggio. Ora sono in
`core/domain/prompts/`, dove il loro contenuto dice che stanno.
"""
from collections.abc import AsyncIterator

from ..domain.prompts.templates import build_summarize_messages
from ..domain.values import Length
from ..ports.llm_client import LLMClient


def summarize(text: str, length: Length, llm: LLMClient) -> AsyncIterator[str]:
    """Riassume `text` nella lunghezza richiesta, come stream di chunk.

    Raises:
        LLMProviderError: propagato dalla porta alla prima iterazione dello
            stream, non alla chiamata di questa funzione.
    """
    return llm.stream(build_summarize_messages(text, length))
