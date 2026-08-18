"""Chi chiede un tetto di token al provider e chi no (UC67.3 passo 3, UC62.1)."""
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


def test_ogni_lunghezza_del_dominio_ha_un_tetto() -> None:
    assert set(LENGTH_MAX_TOKENS) == set(LUNGHEZZE)


def test_i_tetti_crescono_con_la_lunghezza_richiesta() -> None:
    assert (
        LENGTH_MAX_TOKENS["breve"]
        < LENGTH_MAX_TOKENS["medio"]
        < LENGTH_MAX_TOKENS["dettagliato"]
    )


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


#`is None` e non `== None`, il doppio parte da NON_INVOCATO cosi' un test che
#non consuma lo stream fallisce invece di passare per inerzia.


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
