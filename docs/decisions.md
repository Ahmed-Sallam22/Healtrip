# Architecture Decision Records

### ADR-001 — Deterministic triage runs before the LLM
**Context:** Missing an emergency is the worst failure; LLMs are non-deterministic, slow and sometimes unavailable.
**Decision:** Red-flag rules (EN/AR, negation-aware) run first. An emergency short-circuits with fixed wording and ER hospitals from the DB. `URGENT` rules set a floor that the validator enforces (upgrade-only).
**Consequences:** The emergency path is testable, fast and independent of the LLM. The rules are incomplete by nature, so the model may still escalate but can never de-escalate. The rules are data, versioned (`TRIAGE_RULES_VERSION`) and need clinician review.

### ADR-002 — The turn ends with a terminal tool, not free text
**Decision:** `submit_recommendation` or `ask_clarifying_questions`, both Zod-validated. Free text is rejected (one nudge).
**Consequences:** Answers are machine-checkable, which enables grounding, repair and analytics. Knowledge-only turns still carry a conservative `nextStep`.

### ADR-003 — Grounding against this turn's evidence; cards rendered from the DB
**Decision:** The validator checks ids, citations and free-text claims against records captured when the tools ran *this turn*. The UI cards are re-fetched by id.
**Consequences:** Even a real id is rejected if it wasn't retrieved this turn, so the model can't rely on memory. One repair round, then a text-free safe fallback.

### ADR-004 — Hybrid retrieval: SQL for structured facts, RAG for unstructured text
**Decision:** Fees, city, specialty and availability come only from SQL tools. Bios, procedures and processes come only from cited RAG chunks. A bio can only be used with that doctor's SQL record.
**Consequences:** No "semantic" price filtering errors. The prompt, the validator and the tool descriptions all encode the split.

### ADR-005 — Separate Python RAG service
**Decision:** FastAPI service with its own schema and DB role, behind an internal shared secret.
**Consequences:** Python AI ecosystem, independent scaling and deploys, a clear boundary. The cost is one more service and a network hop, mitigated by a 3 s budget and graceful degradation (`RAG_UNAVAILABLE`).

### ADR-006 — pgvector instead of a dedicated vector DB
**Decision:** Same Postgres instance, `rag` schema, HNSW cosine index, 384-dim vectors for every provider (OpenAI via `dimensions=384`).
**Consequences:** One database to run and secure, and transactional re-ingestion. Revisit at very large scale or for multi-tenant isolation.

### ADR-007 — Mock LLM and mock embeddings as first-class providers
**Decision:** A deterministic `MockLlmProvider` (scripted policy) and lexical hash embeddings.
**Consequences:** Reviewers run everything offline, and CI is deterministic and free. Adversarial model behaviour is scriptable. The mock is **not** evidence of model quality; real-model evals are listed under next steps.

### ADR-008 — NestJS + Prisma for the API
**Decision:** NestJS modules and DI mirror the architecture. Prisma gives typed, parameterised queries and migrations.
**Consequences:** Ports (abstract classes) make every component testable in isolation. Prisma is not used for vector search, which lives in the RAG service.

### ADR-009 — Idempotent, provider-aware ingestion
**Decision:** `content_hash = sha256(title, content, embedding model, chunker version)`. Unchanged documents are skipped, changed ones are replaced transactionally, removed ones are deleted, and orphaned sourceIds are skipped.
**Consequences:** Re-running ingestion is cheap and safe, and switching the embedding provider re-embeds automatically.

### ADR-010 — Least-privilege database roles
**Decision:** Separate migrator, api and rag roles. The api role has no DDL and no DELETE. The rag role has column-level `SELECT(id)` on Doctor/Hospital.
**Consequences:** A compromised API process can't drop tables or delete provider data, and RAG can't read patient conversations. Found during verification: Postgres needs database-level `CREATE` even for `CREATE SCHEMA IF NOT EXISTS`, so the RAG bootstrap checks for existence first.

### ADR-011 — Session memory as structured facts
**Decision:** A JSONB `ExtractedFacts`, updated by a deterministic extractor plus an optional validated model patch.
**Consequences:** The agent asks fewer questions, state is inspectable and testable, and triage can use structured severity.
