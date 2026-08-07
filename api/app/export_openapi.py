"""Scrive il contratto OpenAPI su file.

Committato: e' cio' che permette a `pnpm types:gen` di girare senza un server
attivo, e a una revisione di vedere che una PR cambia l'API.
"""
import json
from pathlib import Path

from .main import app

DESTINAZIONE = Path(__file__).resolve().parent.parent / "openapi.json"


def main() -> None:
    DESTINAZIONE.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
