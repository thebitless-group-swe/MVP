"""Test della guardia contro la deriva del contratto OpenAPI."""

from pathlib import Path

import pytest

from app.export_openapi import DESTINAZIONE, main, render


def test_il_contratto_committato_e_aggiornato() -> None:
    assert DESTINAZIONE.read_text(encoding="utf-8") == render(), (
        "openapi.json non è aggiornato: esegui `uv run python -m app.export_openapi`"
    )


def test_la_destinazione_e_un_file_esistente_che_si_chiama_openapi_json() -> None:
    """Il secondo fatto duplicato, ed e' quello che si rompeva in silenzio."""
    assert DESTINAZIONE.name == "openapi.json"
    assert DESTINAZIONE.is_file()


def test_main_scrive_esattamente_cio_che_render_produce(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Copre la scrittura senza toccare il contratto committato."""
    destinazione_finta = tmp_path / "openapi.json"
    monkeypatch.setattr("app.export_openapi.DESTINAZIONE", destinazione_finta)

    main()

    assert destinazione_finta.read_text(encoding="utf-8") == render()
