# HealTrip RAG service (`apps/rag`)

Internal FastAPI service behind the API's `search_knowledge_base` tool. It indexes **unstructured
text only**: doctor bios, hospital profiles and patient-guidance guides. Fees, cities and slots
stay in SQL. Every result has a stable `chunkId` for the agent to cite.

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
export RAG_DATABASE_URL=postgresql://ahmed@localhost:5432/healtrip
.venv/bin/python -m app.ingest            # idempotent; --force re-embeds everything
.venv/bin/uvicorn app.main:app --port 8001 # OpenAPI docs at http://localhost:8001/docs
.venv/bin/ruff check . && .venv/bin/pytest -q   # tests use the healtrip_test database
```

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `RAG_DATABASE_URL` | `postgresql://localhost:5432/healtrip` | libpq URL; a Prisma `?schema=` param is stripped |
| `RAG_INTERNAL_TOKEN` | `dev-internal-token` outside production | required when `APP_ENV=production` |
| `EMBEDDINGS_PROVIDER` | `mock` | `mock` \| `local` (needs `requirements-local.txt`) \| `openai` |
| `OPENAI_API_KEY`, `OPENAI_EMBEDDINGS_MODEL` | `text-embedding-3-small` | requested with `dimensions=384` |
| `LOCAL_EMBEDDINGS_MODEL` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | 384-dim |
| `RAG_MIN_SCORE` | provider default | mock 0.25, local 0.35, openai 0.30 (see `app/config.py`) |
| `RAG_AUTO_INGEST` | `false` | ingest at startup (handy in docker compose) |
| `SEED_DATA_DIR` / `KB_DIR` | `../../data/seed` / `data/kb` | `/data/seed` and `/app/data/kb` in Docker |
| `TEST_RAG_DATABASE_URL` | `postgresql://ahmed@localhost:5432/healtrip_test` | pytest only; DB tests skip if unreachable |

## API

All endpoints except `GET /health` need `X-Internal-Token`. Errors are always
`{"code", "message"}` (422 adds `details`). `X-Request-Id` is echoed back and logged.

- `POST /search` with `{query, locale?, sourceTypes?, topK?, minScore?}` returns
  `{results: [{chunkId, documentId, sourceType, sourceId, title, text, score, locale}], embeddingModel, minScore, tookMs}`.
  An empty `results` list is a normal 200.
- `POST /ingest` with `{force?}` returns `{created, updated, unchanged, deleted, skippedOrphans, chunks, embeddingModel}`.
- `GET /health` returns `{status, db, embeddings, documents}`. It is 503 when the DB is down, and
  `status` is `degraded` when the index is empty.

## Design notes

- **Schema `rag`** (`documents`, `chunks`) is owned here and created at startup; Prisma never
  touches it. Chunks hold `vector(384)` with an HNSW `vector_cosine_ops` index.
- **Stable IDs**: `doctor_bio:doc-cai-card-01:en#0`, `patient_guide:second-opinion:ar#2`.
  `sourceId` is the `Doctor`/`Hospital` id (null for guides). During ingestion, bios and profiles
  whose id is missing from `public."Doctor"`/`"Hospital"` are skipped (`skippedOrphans`).
- **Idempotent ingestion**: `content_hash` covers title, content, embedding model and chunker
  version, so switching provider or chunker re-embeds automatically. Changed documents get
  their chunks replaced in one transaction, and removed ones are deleted. A Postgres advisory
  lock rejects concurrent runs (409).
- **Mock embeddings are lexical, not semantic.** Feature hashing of normalised EN/AR tokens
  plus character 4-grams. The whole demo runs without keys, but there are no synonyms or
  cross-lingual matches ("visa" will not find "entry rules"). Use `local` or `openai` for real
  semantic retrieval and re-check the threshold.
