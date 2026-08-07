"""Test della guardia contro la deriva del contratto OpenAPI.

Le derive possibili sono due, e questo file ne sorvegliava una sola:

- deriva di **schema** — un DTO cambia e `openapi.json` resta indietro. E' quella
  frequente, ed e' quella su cui poggia la DoD «openapi.json invariato» di piu'
  di una issue del backlog. Era gia' coperta, e lo resta: il test non era un
  placebo.
- deriva di **serializzazione** — cambia il modo in cui il contratto viene
  scritto (indentazione, ordinamento, encoding). Era invisibile qui, perche' il
  file ricopiava le due righe di `export_openapi` invece di usarle: mutando
  `indent=2` in `indent=4` dentro il modulo, questo test passava e solo la CI
  diventava rossa. Ora il confronto passa da `render()`, quindi la mutazione
  arriva fin qui.

Nessuna delle due lasciava passare un difetto fino all'utente: lo step della CI
le intercetta entrambe, rigenerando il contratto e pretendendo zero diff. Cio'
che cambia e' dove il problema si scopre e quanto costa diagnosticarlo — non e'
la gravita' degli enum disallineati, che producevano un 422 a ogni click.
"""

from pathlib import Path

import pytest

from app.export_openapi import DESTINAZIONE, main, render


def test_il_contratto_committato_e_aggiornato() -> None:
    assert DESTINAZIONE.read_text(encoding="utf-8") == render(), (
        "openapi.json non è aggiornato: esegui `uv run python -m app.export_openapi`"
    )


def test_la_destinazione_e_un_file_esistente_che_si_chiama_openapi_json() -> None:
    """Il secondo fatto duplicato, ed e' quello che si rompeva in silenzio.

    Prima `DESTINAZIONE` era ricalcolata in entrambi i file, con lo stesso
    `parent.parent`: i due percorsi coincidevano solo perche' i due moduli
    stanno per coincidenza alla stessa profondita'. Se uno dei due si fosse
    spostato, il test avrebbe confrontato un percorso diverso da quello scritto
    — e sarebbe passato. Ora la costante e' una sola, e questo test fissa che
    punti a un file che esiste davvero.
    """
    assert DESTINAZIONE.name == "openapi.json"
    assert DESTINAZIONE.is_file()


def test_main_scrive_esattamente_cio_che_render_produce(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Copre la scrittura senza toccare il contratto committato.

    `DESTINAZIONE` va deviata su una directory temporanea: senza, il test
    riscriverebbe `api/openapi.json` a ogni esecuzione, e un `main()` rotto
    rimedierebbe da solo a cio' che il test dovrebbe segnalare.
    """
    destinazione_finta = tmp_path / "openapi.json"
    monkeypatch.setattr("app.export_openapi.DESTINAZIONE", destinazione_finta)

    main()

    assert destinazione_finta.read_text(encoding="utf-8") == render()
