import os
from collections.abc import AsyncIterator, Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

#
# Chiavi fittizie per l'intera suite — decisione dichiarata, non un espediente.
#
# Prima la suite girava con le chiavi vuote e superava la validazione all'avvio
# **per caso**: il lifespan non viene eseguito da `TestClient(app)` nudo, e solo
# test_lifespan.py usa `with`. Sarebbe bastato che qualcuno scrivesse `with` in
# un altro file per rompere test che con le chiavi non c'entrano nulla.
#
# Con le chiavi presenti l'ambiente di test assomiglia alla produzione invece di
# allontanarsene, e la validazione al boot e' esercitata davvero. I test che
# vogliono l'ASSENZA di una chiave se la impongono da soli con
# `monkeypatch.setenv(..., "")` piu' `cache_clear()`, come gia' fanno.
#
# Assegnazione secca e non `setdefault`: con `setdefault` la suite si
# comporterebbe in modo diverso sulla macchina di chi ha chiavi vere esportate.
# Nessun test ha bisogno di chiavi vere — se ne avesse bisogno farebbe rete, ed
# e' cio' che i doppi esistono per evitare.
#
# Non si usa un `.env.test`: `Settings` legge `.env`, e renderlo condizionale
# significherebbe portare la conoscenza dei test dentro il codice di produzione.
#
# ATTENZIONE ALL'ORDINE: queste due righe stanno PRIMA degli import di `app`, e
# non e' disordine. `app.main` costruisce le impostazioni a import-time per il
# CORS, e `get_settings` e' `@lru_cache`: spostare gli import qui sopra —
# per esempio «riordinando» il file — farebbe memorizzare in cache una
# configurazione con le chiavi vuote prima che queste righe vengano eseguite,
# e i test tornerebbero a dipendere da chi chiama `cache_clear()` per primo.
#
os.environ["LITELLM_API_KEY"] = "sk-chiave-finta-per-i-test"
os.environ["TAVILY_API_KEY"] = "tvly-chiave-finta-per-i-test"

from app.core.domain.values import Message
from app.core.ports.content_extractor import ContentExtractor, ContentExtractorError
from app.core.ports.llm_client import LLMClient
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class DummyLLMClient(LLMClient):
    """Client LLM finto per test: yielda chunk fissi senza I/O.

    Registra in `received_messages` i messaggi con cui viene invocato: e' cosi'
    che i test degli use case di `core/services/` verificano il prompt prodotto
    senza passare da HTTP. La registrazione avviene alla prima iterazione dello
    stream, non alla chiamata di `stream()`, perche' il corpo di un generatore
    asincrono non viene eseguito finche' nessuno lo consuma; resta `None`
    finche' lo stream e' freddo.
    """

    DEFAULT_CHUNKS = ["chunk1 ", "chunk2 ", "fine"]

    #Sentinella distinta da None: `received_max_tokens is None` deve significare
    #«lo use case non ha chiesto alcun tetto», non «lo stream non e' mai partito».
    #Senza questa distinzione un test che verifica l'assenza di budget passerebbe
    #anche su uno stream che nessuno ha consumato.
    NON_INVOCATO = object()

    def __init__(self, chunks: list[str] | None = None) -> None:
        self._chunks = chunks if chunks is not None else self.DEFAULT_CHUNKS
        self.received_messages: Sequence[Message] | None = None
        self.received_max_tokens: int | None | object = self.NON_INVOCATO

    async def stream(
        self, messages: Sequence[Message], max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        self.received_messages = messages
        self.received_max_tokens = max_tokens
        for chunk in self._chunks:
            yield chunk

class DummyContentExtractor(ContentExtractor):
    """ContentExtractor finto per test: ritorna contenuto statico."""
    async def extract(self, url: str) -> str:
        return "Contenuto di esempio per il test."


class FailingContentExtractor(ContentExtractor):
    """ContentExtractor finto che fallisce sempre."""
    async def extract(self, url: str) -> str:
        raise ContentExtractorError("Errore simulato durante l'estrazione")

@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def dummy_llm_client() -> DummyLLMClient:
    return DummyLLMClient()

@pytest.fixture
def dummy_content_extractor() -> ContentExtractor:
    return DummyContentExtractor()


@pytest.fixture
def failing_content_extractor() -> ContentExtractor:
    return FailingContentExtractor()


#
# `content_extractor_override` stava qui, ed e' stata rimossa insieme alle
# chiavi vuote che la rendevano necessaria.
#
# Esisteva perche' FastAPI risolve le dipendenze **prima** di validare il corpo:
# senza TAVILY_API_KEY la rotta rispondeva 503 anche a una richiesta malformata,
# e un test sulla validazione non arrivava mai a esercitare cio' che voleva
# verificare. Con la chiave presente il provider costruisce l'adattatore senza
# toccare la rete, la validazione respinge, e i tre test che la usavano —
# tutti test di 422/400 che non raggiungono mai `extract()` — funzionano senza
# doppio. Verificato: stessi 395 test, stesso tempo di esecuzione.
#
# Chi ha bisogno di un doppio perche' arriva davvero all'estrazione se lo
# dichiara sul posto, come fa test_smoke.py: e' piu' esplicito di una fixture
# applicata per abitudine.
#
@pytest.fixture
def sse_chunks() -> str:
    return (FIXTURES_DIR / "litellm_sse.txt").read_text(encoding="utf-8")
