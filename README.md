# Second Brain — MVP

Repository contenente l'MVP sviluppato dal gruppo The Bitless.

Editor Markdown con sette funzioni di elaborazione del testo affidate a un LLM
(riassunto, traduzione, riscrittura, correzione, analisi critica, generazione da
prompt e da link), con risposta in streaming.

# Documentazione

Tutta la documentazione relativa al progetto è consultabile su
https://thebitless.live

# Prerequisiti

| Strumento | Versione |
|---|---|
| Docker | qualsiasi recente |
| Node | **22** (`>=22 <23`) |
| pnpm | **>=11** |
| Python | 3.12 |

Il package manager del frontend è **pnpm**, non npm: `npm install` genera un
albero di dipendenze diverso da quello della CI. Nel repository c'è un solo
lockfile, `web/pnpm-lock.yaml`.

## Avere un file .env nella root del progetto

```bash
cp .env.example .env
```

File di esempio:

```bash
# Gateway LLM (compatibile OpenAI)
LITELLM_BASE_URL=https://your-litellm-gateway.example/v1
LITELLM_MODEL=your-model-name
LITELLM_API_KEY=your-litellm-api-key

# Estrazione del contenuto dei link
TAVILY_API_KEY=your-tavily-api-key

# Origini CORS accettate dal backend (formato JSON)
CORS_ORIGINS=["http://localhost:5173"]
```

Senza `LITELLM_API_KEY` il backend non si avvia. Senza `TAVILY_API_KEY` si avvia
lo stesso, ma la generazione da link risponde 503.

# Usando docker

Nella root del progetto esegui il comando:

```cmd
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:8000

# Per spegnere

Nel terminale premere Ctrl+C oppure `docker compose down`

## Setup Frontend (no docker needed)

Andare nella cartella web:

```bash
cd web
```

Install dependencies:

```bash
pnpm install
```

Run:

```bash
pnpm dev
```

Run test:

```bash
pnpm test        # in watch
pnpm test:run    # una passata sola
```

## Setup Backend (no docker needed)

Andare nella cartella api:

```bash
cd api
```

Il backend legge il `.env` dalla cartella in cui gira, quindi qui ne serve una
copia (è già ignorata da git):

```bash
cp ../.env .env
```

Install dependencies:

```bash
uv sync
```

Run:

```bash
uv run uvicorn app.main:app --reload
```

Run test:

```bash
uv run pytest
```
