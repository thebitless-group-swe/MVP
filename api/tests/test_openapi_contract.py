import json
from pathlib import Path

from app.main import app

DESTINAZIONE = Path(__file__).resolve().parent.parent / "openapi.json"


def test_il_contratto_committato_e_aggiornato() -> None:
    atteso = json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    assert DESTINAZIONE.read_text(encoding="utf-8") == atteso, (
        "openapi.json non è aggiornato: esegui `uv run python -m app.export_openapi`"
    )
