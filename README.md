# Second Brain — MVP

Editor Markdown con funzioni di elaborazione testo affidate a un LLM, in streaming
end-to-end contro un provider LiteLLM (compatibile OpenAI).

## Prerequisiti

| Strumento | Versione | Vincolata da |
|---|---|---|
| Node | **22** (`>=22 <23`) | `.nvmrc`, `engines` in `web/package.json` |
| pnpm | **>=11** | `packageManager` ed `engines` in `web/package.json` |
| Python | 3.12 | `api/.python-version` |

**Il package manager ufficiale del frontend è `pnpm`.** Non usare `npm install`: genera un
albero di dipendenze diverso da quello che risolve la CI, e i bug che ne nascono si
manifestano solo in pipeline. Per lo stesso motivo nel repository esiste un solo
lockfile, `web/pnpm-lock.yaml`.

Node **deve** essere la 22: su versioni più recenti parte della suite frontend fallisce.
Con [nvm](https://github.com/nvm-sh/nvm) la versione giusta si prende dal `.nvmrc`:

```sh
nvm use    # legge .nvmrc dalla root
```

## Setup

```sh
cp .env.example .env
```

| Variabile | Serve a | Se manca |
|---|---|---|
| `LITELLM_BASE_URL` | endpoint del gateway LLM | il processo **non parte** |
| `LITELLM_MODEL` | modello da invocare | il processo **non parte** |
| `LITELLM_API_KEY` | autenticazione al gateway | il processo **non parte** |
| `TAVILY_API_KEY` | estrazione del contenuto da un link | parte, ma `/api/generate-from-link` risponde 503 |
| `CORS_ORIGINS` | origini ammesse, in formato JSON | default `["http://localhost:5173"]` |

L'asimmetria è voluta: senza la chiave LiteLLM nessuna delle sette funzioni AI
funziona, quindi tanto vale non avviare; senza quella di Tavily si rompe un
endpoint su otto, e per quello basta un 503 per richiesta.

## Avvio (Docker)

```sh
docker compose up --build
```

- API: http://localhost:8000
- Web: http://localhost:5173

## Sviluppo locale

Backend:

```sh
cd api
uv sync
uv run uvicorn app.main:app --reload
uv run pytest
uv run ruff check .
uv run import-linter lint
```

Frontend:

```sh
cd web
pnpm install
pnpm dev
pnpm test          # vitest
pnpm lint          # eslint
pnpm tsc -b        # controllo dei tipi
```

**Il controllo dei tipi è `tsc -b`, non `tsc --noEmit`.** `web/tsconfig.json` è un file
di soli riferimenti (`"files": []` più `references`): senza `-b` il compilatore non segue
i progetti referenziati, riceve zero file in input ed esce 0 qualunque cosa contenga
`src/`. È verificabile in dieci secondi — si introduce un errore di tipo e si osserva che
`--noEmit` non lo segnala e `-b` sì.

## Struttura del backend

```
api/app/
├── main.py                  composition root: crea l'app, monta i router,
│                            registra gli handler. Nessuna logica.
├── dependencies.py          i tre provider: quale adattatore soddisfa quale porta
├── settings.py              cosa è la configurazione (lo schema, non il provider)
│
├── api/                     ADATTATORI PRIMARI — chi chiama l'applicazione
│   ├── routes/              le otto route HTTP
│   │   ├── constants.py     costanti pubblicate nel contratto
│   │   ├── summarize.py  generate.py  generate_link.py  translate.py
│   │   └── rewrite.py    grammar.py   critique.py
│   ├── schemas.py           DTO Pydantic: il confine HTTP
│   ├── sse_streaming.py     formattazione della risposta SSE verso il client
│   └── errors.py            traduzione degli errori di validazione per l'utente
│
├── core/                    IL DOMINIO — non importa nulla verso l'esterno
│   ├── domain/
│   │   ├── values.py        vocabolari, soglie e tetti di token condivisi
│   │   └── prompts/         i tredici prompt: regole, template, composizione
│   ├── ports/               le due interfacce: LLMClient, ContentExtractor
│   └── services/            i sette use case, uno per file
│
└── infrastructure/          ADATTATORI SECONDARI — chi l'applicazione chiama
    └── adapters/            LiteLLMClient, TavilyExtractor
```

**Dove va cosa.** La domanda da farsi non è «di che tecnologia si tratta» ma «da
che parte dell'esagono sta». Al centro c'è `core/`, che contiene le regole del
prodotto e **non importa nulla dagli altri package**: gli use case in
`core/services/` sono funzioni che ricevono una porta come ultimo parametro e non
sanno chi la implementi. Attorno stanno i due tipi di adattatore. In `api/` vive
tutto ciò che sta sul confine HTTP verso il client: le route, che traducono una
richiesta esterna in una chiamata al dominio, i DTO che validano il corpo HTTP,
i messaggi d'errore rivolti all'utente, la formattazione SSE della risposta. In
`infrastructure/` vive tutto ciò che il dominio chiama per parlare col mondo:
il client LLM e l'estrattore di contenuti. Le due direzioni
non si toccano mai direttamente — una route non istanzia un adattatore, chiede
una porta e la passa a uno use case.

**Il collo di bottiglia è `dependencies.py`**, il composition root: è l'unico
modulo che nomina le classi concrete `LiteLLMClient` e `TavilyExtractor` fuori
dai file che le definiscono, ed è lì che si decide quale adattatore soddisfa
quale porta. Se stai per scrivere il nome di una classe di infrastruttura in una
route o in un servizio, quello è il segnale che la dipendenza va invertita: si
dichiara la porta con `Depends(get_...)` e il composition root fa il resto — che
è anche ciò che permette ai test di sostituire ogni adattatore con un doppio
senza toccare il codice di produzione. Resta una deroga nota: `get_settings`,
che non passa da `Depends` perché nessuna route la inietta.

### Architettura esagonale

Perché le dipendenze non vengano invertite, `import-linter` controlla i quattro
contratti definiti in `api/.importlinter`. Il controllo gira in CI e in locale:

```sh
cd api
uv run import-linter lint
```

## Il contratto OpenAPI

`api/openapi.json` è generato dal codice ma **versionato**, e `web/src/types/api.ts` è
generato da lui. Committarli entrambi ha due effetti: `pnpm types:gen` gira senza un
server attivo, e una revisione vede nel diff della PR che l'API è cambiata.

Il prezzo è che possono restare indietro. Chi tocca uno schema, una route o un enum del
backend rigenera entrambi nello stesso commit:

```sh
cd api && uv run python -m app.export_openapi   # aggiorna api/openapi.json
cd ../web && pnpm types:gen                     # aggiorna web/src/types/api.ts
```

Due guardie impediscono di dimenticarsene:

- `api/tests/test_openapi_contract.py` fallisce in locale se `openapi.json` non
  corrisponde a ciò che l'app produce adesso;
- la CI rigenera entrambi i file e pretende `git diff --exit-code`, quindi una PR che
  cambia l'API senza riesportarla non passa.

Senza queste guardie il frontend continuerebbe a compilare contro tipi stantii: `tsc`
resta verde perché sta verificando il codice contro un contratto che non esiste più.

Attenzione, una trappola: il docstring di `ApiConstants` in
`api/app/api/routes/constants.py` finisce in `openapi.json` come `description`.
Riscriverlo senza riesportare fa fallire la CI.
