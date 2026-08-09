"""Test B-03/B-05: prompt delle quattro funzioni AI e dei sei cappelli."""
from typing import get_args

import pytest

from app.core.domain.prompts.rules import STYLE_INSTRUCTIONS
from app.core.domain.prompts.templates import (
    CRITIQUE_FOCUS,
    CRITIQUE_PERSPECTIVES,
    build_critique_messages,
    build_grammar_messages,
    build_rewrite_messages,
    build_translate_messages,
)
from app.core.domain.values import NO_ERRORS_MARKER
from app.schemas import Hat, Language, Style

TEST_TEXT = "Un testo abbastanza lungo da superare la validazione di schema."

#Termini che ciascuna prospettiva deve nominare (R-65 -> R-70)
HAT_KEYWORDS: dict[Hat, tuple[str, ...]] = {
    "bianco": ("dati", "fatti"),
    "rosso": ("emozion", "percezion"),
    "giallo": ("benefici", "opportunit"),
    "nero": ("rischi", "critic"),
    "verde": ("creativ", "alternative"),
    "blu": ("logic", "organizzazione"),
}


def _assert_system_then_user(msgs: list[dict], text: str) -> None:
    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"
    assert msgs[1]["content"] == text
    #Il testo utente non deve finire nel system prompt
    assert text not in msgs[0]["content"]


class TestTranslateMessages:
    @pytest.mark.parametrize("language", list(get_args(Language)))
    def test_language_lands_in_system_prompt(self, language: Language) -> None:
        msgs = build_translate_messages(TEST_TEXT, language)

        _assert_system_then_user(msgs, TEST_TEXT)
        assert language in msgs[0]["content"]


class TestRewriteMessages:
    @pytest.mark.parametrize("style", list(get_args(Style)))
    def test_style_instruction_lands_in_system_prompt(self, style: Style) -> None:
        msgs = build_rewrite_messages(TEST_TEXT, style)

        _assert_system_then_user(msgs, TEST_TEXT)
        assert STYLE_INSTRUCTIONS[style] in msgs[0]["content"]

    def test_every_style_has_its_own_instruction(self) -> None:
        instructions = list(STYLE_INSTRUCTIONS.values())

        assert set(STYLE_INSTRUCTIONS.keys()) == set(get_args(Style))
        assert len(set(instructions)) == len(instructions)


class TestGrammarMessages:
    def test_returns_system_then_user(self) -> None:
        msgs = build_grammar_messages(TEST_TEXT)

        _assert_system_then_user(msgs, TEST_TEXT)

    def test_prompt_declares_the_no_errors_sentinel(self) -> None:
        #Il prompt non e' piu' una costante di modulo ma il risultato della
        #composizione: la sentinella si cerca dove arriva al provider.
        assert NO_ERRORS_MARKER == "NESSUN_ERRORE_RILEVATO"
        assert NO_ERRORS_MARKER in build_grammar_messages(TEST_TEXT)[0]["content"]


class TestCritiqueMessages:
    @pytest.mark.parametrize("hat", list(get_args(Hat)))
    def test_returns_system_then_user(self, hat: Hat) -> None:
        msgs = build_critique_messages(TEST_TEXT, hat)

        _assert_system_then_user(msgs, TEST_TEXT)

    def test_six_hats_produce_six_distinct_system_prompts(self) -> None:
        prompts = [
            build_critique_messages(TEST_TEXT, hat)[0]["content"]
            for hat in get_args(Hat)
        ]

        assert len(prompts) == 6
        assert len(set(prompts)) == 6

    @pytest.mark.parametrize("hat", list(get_args(Hat)))
    def test_each_hat_names_its_own_perspective(self, hat: Hat) -> None:
        system_content = build_critique_messages(TEST_TEXT, hat)[0]["content"].lower()

        for keyword in HAT_KEYWORDS[hat]:
            assert keyword in system_content, f"cappello {hat}: manca '{keyword}'"

    def test_registry_covers_exactly_the_six_hats(self) -> None:
        #Due registri invece di uno: il fuoco della prospettiva entra nella
        #frase di ruolo, le tre consegne nella sezione dedicata. Devono coprire
        #gli stessi sei cappelli, altrimenti un colore avrebbe il ruolo di uno
        #e le consegne di nessuno.
        assert set(CRITIQUE_FOCUS.keys()) == set(get_args(Hat))
        assert set(CRITIQUE_PERSPECTIVES.keys()) == set(get_args(Hat))
