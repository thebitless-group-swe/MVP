"""Scrive il contratto OpenAPI su file.

Il file va committato, serve a far girare `pnpm types:gen` senza server acceso.
"""
import json
from pathlib import Path

from .main import app

DESTINAZIONE = Path(__file__).resolve().parent.parent / "openapi.json"


def render() -> str:
    """Serializza il contratto nella forma esatta in cui finisce su disco."""
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def main() -> None:
    DESTINAZIONE.write_text(render(), encoding="utf-8")


if __name__ == "__main__":
    main()
