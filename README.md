<<<<<<< HEAD
# PoC — Pipeline LLM streaming end-to-end

Proof of Concept per validare la pipeline LLM streaming end-to-end contro un provider LiteLLM (compatibile OpenAI).

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

Rigenerare i tipi TypeScript dall'OpenAPI (richiede API in esecuzione su `localhost:8000`):

```sh
cd web
pnpm types:gen
```
=======
# MVP
>>>>>>> origin/main
