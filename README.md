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

### Architettura esagonale

Il repository è organizzato secondo il pattern ports & adapters (`app.core/`,
`app.infrastructure/`, `app.routes/`). Per impedire che le dipendenze vengano
invertite, `import-linter` controlla i contratti definiti in `api/.importlinter`.

Esegui il controllo in locale con:

```bash
cd api
uv run import-linter lint