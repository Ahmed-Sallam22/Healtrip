# Agent design

## What the model sees

```
system:  buildSystemPrompt({ allowClarify })        ← versioned (PROMPT_VERSION)
history: previous turns as plain redacted text
user:    <session_facts>{…ExtractedFacts JSON…}</session_facts>
         <locale>ar|en</locale>
         [<guardrail_notice>…</guardrail_notice>]    ← only when injection is flagged
         <user_message>
         …redacted patient text (delimiter tags neutralised)…
         </user_message>
tools:   JSON Schemas generated from the shared Zod schemas
```

## Loop (simplified)

```ts
while (true) {
  if (deadline passed) return fallback('AGENT_TIMEOUT');
  tools = budgetLeft ? allTools : terminalToolsOnly;         // step budget
  if (clarificationRounds >= 3) remove ask_clarifying_questions;
  res = await llmWithOneRetry(system, messages, tools);      // per-call timeout ≤ 15 s
  if (!res.toolCalls.length) { nudge once; else fallback('NO_TERMINAL_TOOL') }
  if (terminal call) {
    v = validator.validate(call.args, turnEvidence, { triageFloor, userAmounts });
    if (v.ok) return v.value;                                // possibly upgraded by the floor
    if (repaired once) return fallback('GROUNDING_FAILED');
    reply to the call with { code: 'GROUNDING_FAILED', details: v.errors }; continue;
  }
  results = await Promise.all(calls.map(registry.execute));  // Zod-validated, never throws
  turnEvidence.absorb(results.evidence);                     // full DB rows / chunks, server-side only
  append tool results; audit each call; trace each call;
}
```

Why the evidence is kept server-side: the model sees compact tool results (ids plus the fields it needs). The validator checks against the full records (`DoctorRecord`, `KnowledgeChunk`) captured when the tool ran, so it doesn't depend on what the model chose to repeat.

## Grounding rules (GroundingValidator)

| Rule | Error example |
|---|---|
| Schema (enum, sizes, `disclaimerShown: true`) | `schema: nextStep: Invalid enum value` |
| Provider id returned this turn | `providerId "doc-fake-001" was not returned by any tool in this turn` |
| Price in text = a returned fee or the user's budget | `mentions price $25, which does not match any fee returned by tools` |
| Rating in text = a returned rating | `mentions rating 5, …` |
| Doctor names (EN "Dr. X", AR "د. X") belong to returned doctors | `mentions "Dr. House", who was not returned…` |
| City in matchReason = the doctor's DB city | `mentions Istanbul but the doctor is in Cairo` |
| SECOND_OPINION ⇒ `offersSecondOpinion = true` | `… does not offer second opinions` |
| Citation returned by `search_knowledge_base` this turn | `citation "…" was not returned…` |
| Doctor-bio citation ⇒ that doctor was fetched via SQL **and** is in providers | `… include that doctor in providers or drop the citation` |
| Triage floor (never downgrade) | *warning*: `nextStep SELF_CARE_MONITOR upgraded to URGENT_CARE_24H` |

## Provider adapters

- **Anthropic** ([anthropic.provider.ts](../apps/api/src/agent/llm/anthropic.provider.ts)): official SDK, manual tool loop, `tool_choice: auto`. Current models reject forced tool choice, and the server enforces terminal tools instead. Assistant content blocks are replayed verbatim within a turn, which keeps thinking blocks valid. Effort defaults to `low`. Sampling parameters are only sent to legacy models that accept them, and server-side refusal fallback is on for models that support it. SDK retries are disabled because the orchestrator owns retries and the deadline.
- **OpenAI** ([openai.provider.ts](../apps/api/src/agent/llm/openai.provider.ts)): function calling, `tool_choice: required`, temperature 0.1. Invalid JSON arguments become a marker object, which fails Zod and returns `INVALID_ARGS`.
- **Mock** ([mock.provider.ts](../apps/api/src/agent/llm/mock.provider.ts)): a deterministic policy that reads the same envelope and tool results a model would:
  - It asks clarifying questions only when the answer changes the decision.
  - It maps symptoms, searches and submits strictly from evidence.
  - It answers knowledge questions from guides and profiles, approximating relevance judgement with a discriminative-term filter.
  - It declines injected instructions.

  Tests inject scripts into it to simulate misbehaving models.

## Clarification policy
- At most 2 questions per turn; at most `AGENT_MAX_CLARIFY_ROUNDS=3` rounds, after which the tool is removed.
- Only questions that change the decision: duration and severity, red-flag symptoms (for chest-type symptoms), city (first round only), or the condition for a second opinion.
- A named specialist ("cardiologist in Istanbul") skips symptom questions, *unless* the patient is weighing options ("not sure whether to see a cardiologist or go to the ER").
