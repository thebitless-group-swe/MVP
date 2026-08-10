# MVP — Pipeline LLM streaming end-to-end

Proof of Concept per validare la pipeline LLM streaming end-to-end contro un provider LiteLLM (compatibile OpenAI).

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
# compilare LITELLM_BASE_URL, LITELLM_MODEL, LITELLM_API_KEY
```

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
```

Frontend:

```sh
cd web
pnpm install
pnpm dev
pnpm tsc --noEmit
```

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
│   └── errors.py            traduzione degli errori di validazione per l'utente
│
├── core/                    IL DOMINIO — non importa nulla verso l'esterno
│   ├── domain/values.py     vocabolari e soglie condivise
│   ├── ports/               le due interfacce: LLMClient, ContentExtractor
│   └── services/            i sette use case, uno per file
│
├── infrastructure/          ADATTATORI SECONDARI — chi l'applicazione chiama
│   └── adapters/            LiteLLMClient, TavilyExtractor, sse_streaming
│
└── llm/prompts.py           i template dei prompt (collocazione transitoria)
```

**Dove va cosa.** La domanda da farsi non è «di che tecnologia si tratta» ma «da
che parte dell'esagono sta». Al centro c'è `core/`, che contiene le regole del
prodotto e **non importa nulla dagli altri package**: gli use case in
`core/services/` sono funzioni che ricevono una porta come ultimo parametro e non
sanno chi la implementi. Attorno stanno i due tipi di adattatore. In `api/` vive
tutto ciò che traduce una richiesta esterna in una chiamata al dominio: le route,
i DTO che validano il corpo HTTP, i messaggi d'errore rivolti all'utente. In
`infrastructure/` vive tutto ciò che il dominio chiama per parlare col mondo:
il client LLM, l'estrattore di contenuti, la formattazione SSE. Le due direzioni
non si toccano mai direttamente — una route non istanzia un adattatore, chiede
una porta e la passa a uno use case.

**Il collo di bottiglia è `dependencies.py`**, il composition root: è l'unico
modulo che nomina le classi concrete `LiteLLMClient` e `TavilyExtractor` fuori
dai file che le definiscono, ed è lì che si decide quale adattatore soddisfa
quale porta. Se stai per scrivere il nome di una classe di infrastruttura in una
route o in un servizio, quello è il segnale che la dipendenza va invertita: si
dichiara la porta con `Depends(get_...)` e il composition root fa il resto — che
è anche ciò che permette ai test di sostituire ogni adattatore con un doppio
senza toccare il codice di produzione. Restano due deroghe note e documentate nel
codice: `llm/prompts.py`, che è dominio ma non è ancora dentro `core/`, e
`get_settings`, che non passa da `Depends` perché nessuna route la inietta.

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
