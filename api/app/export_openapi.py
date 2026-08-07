"""Scrive il contratto OpenAPI su file.

Committato: e' cio' che permette a `pnpm types:gen` di girare senza un server
attivo, e a una revisione di vedere che una PR cambia l'API.
"""
import json
from pathlib import Path

from .main import app

DESTINAZIONE = Path(__file__).resolve().parent.parent / "openapi.json"


def render() -> str:
    """Serializza il contratto nella forma esatta in cui finisce su disco.

    Separata da `main` perche' e' l'unica cosa che un test puo' confrontare con
    il file committato senza riscriverlo. Finche' la serializzazione e' vissuta
    solo dentro `main`, test_openapi_contract.py ha dovuto ricopiarla — e una
    copia che nessuno confronta con l'originale e' esattamente la classe di
    difetto che quel test esiste per intercettare, applicata a se stesso.
    """
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def main() -> None:
    DESTINAZIONE.write_text(render(), encoding="utf-8")


if __name__ == "__main__":
    main()
