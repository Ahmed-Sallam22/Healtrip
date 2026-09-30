# Architecture

## Services and ownership

| Service | Tech | Owns | Talks to |
|---|---|---|---|
| `apps/web` | Next.js 15 (App Router), Tailwind | UI state only | API (REST + SSE), from the browser |
| `apps/api` | NestJS 11, Prisma 6 | `public` schema: providers, sessions, audit | Postgres (role `healtrip_api`), RAG (internal HTTP), LLM vendor |
| `apps/rag` | FastAPI, SQLAlchemy, pgvector | `rag` schema: documents, chunks | Postgres (role `healtrip_rag`); embeddings vendor (optional) |
| `packages/shared` | Zod | Contracts: DTOs, tool args, terminal outputs, facts, errors | imported by web and api |

Each schema has exactly one owner. Prisma never models `rag.*`; the RAG service can only read `Doctor.id` and `Hospital.id` (a column-level grant) to reject orphan documents at ingestion.

## API module map

```
ChatModule ── ChatController (REST + SSE) ── ChatService (turn pipeline) ── ResponseBuilder
 ├─ GuardrailsModule   redactPii · scanForInjection · wrapUserContent
 ├─ TriageModule       RED_FLAG_RULES (data) → TriageService (pure)
 ├─ AgentModule        AgentOrchestrator · GroundingValidator · LLM_PROVIDER factory
 │    └─ ToolsModule   ToolRegistry ← handlers(ProvidersRepository, RagClient)
 ├─ SessionsModule     SessionsRepository (port) ← PrismaSessionsRepository
 ├─ ProvidersModule    ProvidersRepository (port) ← PrismaProvidersRepository · /api/providers
 └─ AuditModule        ToolCallLog · AgentRunLog
HealthModule · RagClientModule · PrismaModule · ConfigModule (validated env)
```

Ports and adapters: `ProvidersRepository`, `SessionsRepository`, `LlmProvider` and the RAG client are abstractions. The test suite swaps in in-memory versions built from the same seed JSON, so the agent, the tools and the full chat pipeline are tested without a database or network.

## Turn pipeline (ChatService)

1. `GuardrailsService.inspect` strips control characters, truncates, redacts PII and flags injection attempts.
2. Load the session and extract facts: the deterministic EN/AR extractor, with negation and intent handling.
3. `TriageService.evaluate` runs over the last 3 user messages, the current message and the facts.
   - `EMERGENCY`: `find_emergency_hospitals` runs through the registry (audited and traced) and returns fixed wording. **The pipeline stops here.**
   - `URGENT`: sets a floor for the validator.
4. `AgentOrchestrator.run` executes the tool loop and returns `recommendation`, `clarification` or `fallback`.
5. `ResponseBuilder` produces cards (DB by id), citations (from this turn's retrieved chunks) and the server disclaimer.
6. Persist the redacted user text, the assistant payload and the facts; audit the run (fire-and-forget, never fatal).

## Failure-mode matrix

| Failure | Detection | Behaviour | Visible where |
|---|---|---|---|
| RAG down / slow | fetch error / 3 s budget | Tool returns `RAG_UNAVAILABLE`, agent continues with SQL tools | Trace, `/api/health` = `degraded` |
| LLM 429/5xx/timeout | `LlmError.retryable` | 1 retry with backoff within the 20 s deadline, then safe fallback | Trace `llm_call` error, `source: fallback` |
| LLM hallucinated id/claim | GroundingValidator | 1 repair round, then safe fallback | Trace `grounding_validator` errors, `AgentRunLog.validationErrors` |
| LLM answers in free text | no tool calls | 1 nudge, then fallback | Trace `free_text_rejected` |
| LLM loops on tools | step budget | After 5 tool steps only terminal tools are offered; then `MAX_STEPS` | Trace |
| DB down | Prisma init/connection errors | 503 `DB_UNAVAILABLE` (bilingual, with emergency numbers) | `/api/health` = `error`, UI banner |
| Bad input | Zod | 400 `VALIDATION_ERROR` with field details | UI toast |
| Abuse | Throttler | 429 `RATE_LIMITED` | UI toast |

## Observability
- Request ids: pino-http honours or generates `X-Request-Id`, echoes it and forwards it to RAG. Every error body carries `requestId`.
- Agent trace: each guardrail, triage, LLM, tool, validation, repair and fallback step, with duration and summary. It is streamed over SSE and stored in the message payload (disable with `EXPOSE_TRACE=false`).
- Audit tables: `ToolCallLog` (per tool call) and `AgentRunLog` (per turn: source, next step, ids, citations, validation errors, provider/model, prompt version, steps, latency).
