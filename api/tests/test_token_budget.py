"""Chi chiede un tetto di token al provider, e chi non deve chiederlo (UC67.3).

Sta in un file solo, come `test_prompt_invariants.py`, perche' la proprieta' che
descrive e' *trasversale ai sette use case* e si legge solo guardandoli insieme:
tre chiedono un tetto, quattro devono non chiederlo. Distribuita nei sette file
dei servizi, la meta' negativa sarebbe sparita — nessuno scrive per abitudine il
test di cio' che un modulo *non* fa.

**Perche' la divisione cade li'.** UC67.3 passo 3 impone il tetto alle
operazioni in cui l'utente sceglie la lunghezza dell'output; UC62.1 offre la
stessa scelta al riassunto. Sono le tre funzioni la cui firma ha `length`, ed e'
esattamente il criterio: il tetto traduce in token una scelta dell'utente, e
dove quella scelta non esiste non c'e' niente da tradurre.

Le altre quattro — traduzione, riscrittura, correzione, analisi — riscrivono un
testo che esiste gia'. Un tetto li' non limiterebbe una scelta: troncherebbe a
meta' frase l'output di un input lungo, senza che ne' l'utente ne' il sistema
possano accorgersene, perche' lo stream terminerebbe in modo indistinguibile da
un completamento riuscito. E' un difetto peggiore della spesa che eviterebbe, ed
e' il motivo per cui il test negativo qui sotto e' scritto.
"""
from collections.abc import AsyncIterator
from typing import get_args

import pytest

from app.core.domain.values import (
    LENGTH_MAX_TOKENS,
    Hat,
    Language,
    Length,
    Style,
)
from app.core.services.critique import critique
from app.core.services.generate import generate
from app.core.services.generate_from_link import generate_from_link
from app.core.services.grammar import grammar
from app.core.services.rewrite import rewrite
from app.core.services.summarize import summarize
from app.core.services.translate import translate
from tests.conftest import DummyContentExtractor, DummyLLMClient

TEXT = "Un testo abbastanza lungo da poter essere elaborato da una funzione AI."
PROMPT = "Scrivi un testo sul mare d'inverno."
URL = "https://example.com"

LUNGHEZZE = list(get_args(Length))


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [chunk async for chunk in stream]


# --- La mappa: forma e coerenza interna ------------------------------------


# Se domani si aggiunge una lunghezza al dominio e non la si aggiunge qui, il
# tetto verrebbe cercato con una chiave assente e la richiesta morirebbe di
# KeyError a runtime, in produzione. Questo test sposta quel guasto in CI.
def test_ogni_lunghezza_del_dominio_ha_un_tetto() -> None:
    assert set(LENGTH_MAX_TOKENS) == set(LUNGHEZZE)


# Il tetto e' la traduzione in token della scelta dell'utente: se non crescesse
# con essa, «dettagliato» potrebbe produrre meno di «breve» e la scelta
# nell'interfaccia direbbe il falso.
def test_i_tetti_crescono_con_la_lunghezza_richiesta() -> None:
    assert (
        LENGTH_MAX_TOKENS["breve"]
        < LENGTH_MAX_TOKENS["medio"]
        < LENGTH_MAX_TOKENS["dettagliato"]
    )


# --- Le tre che il tetto lo chiedono ---------------------------------------


@pytest.mark.parametrize("length", LUNGHEZZE)
async def test_summarize_chiede_il_tetto_della_lunghezza_scelta(
    length: Length, dummy_llm_client: DummyLLMClient
) -> None:
    await _collect(summarize(TEXT, length, dummy_llm_client))

    assert dummy_llm_client.received_max_tokens == LENGTH_MAX_TOKENS[length]


@pytest.mark.parametrize("length", LUNGHEZZE)
async def test_generate_chiede_il_tetto_della_lunghezza_scelta(
    length: Length, dummy_llm_client: DummyLLMClient
) -> None:
    await _collect(generate(PROMPT, length, dummy_llm_client))

    assert dummy_llm_client.received_max_tokens == LENGTH_MAX_TOKENS[length]


@pytest.mark.parametrize("length", LUNGHEZZE)
async def test_generate_from_link_chiede_il_tetto_della_lunghezza_scelta(
    length: Length,
    dummy_llm_client: DummyLLMClient,
    dummy_content_extractor: DummyContentExtractor,
) -> None:
    stream = await generate_from_link(
        URL, length, dummy_content_extractor, dummy_llm_client
    )
    await _collect(stream)

    assert dummy_llm_client.received_max_tokens == LENGTH_MAX_TOKENS[length]


# --- Le quattro che non devono chiederlo -----------------------------------
#
# `is None` e non `== None`: il doppio parte da `NON_INVOCATO`, cosi' un test
# che non consumasse davvero lo stream fallirebbe invece di passare per inerzia.


async def test_translate_non_chiede_alcun_tetto(
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(translate(TEXT, get_args(Language)[0], dummy_llm_client))

    assert dummy_llm_client.received_max_tokens is None


async def test_rewrite_non_chiede_alcun_tetto(
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(rewrite(TEXT, get_args(Style)[0], dummy_llm_client))

    assert dummy_llm_client.received_max_tokens is None


async def test_grammar_non_chiede_alcun_tetto(
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(grammar(TEXT, dummy_llm_client))

    assert dummy_llm_client.received_max_tokens is None


async def test_critique_non_chiede_alcun_tetto(
    dummy_llm_client: DummyLLMClient,
) -> None:
    await _collect(critique(TEXT, get_args(Hat)[0], dummy_llm_client))

    assert dummy_llm_client.received_max_tokens is None
