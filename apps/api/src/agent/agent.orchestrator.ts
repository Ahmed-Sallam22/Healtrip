import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type AskClarifyingQuestionsArgs,
  type ExtractedFacts,
  type Locale,
  type SubmitRecommendationArgs,
  TOOL_NAMES,
} from '@healtrip/shared';
import { TraceRecorder } from '../common/trace';
import { ENV, type Env } from '../config/env';
import type { InjectionScan } from '../guardrails/injection';
import { summarizeResult, ToolRegistry, type ToolExecution } from '../tools/tool-registry';
import type { TriageResult } from '../triage/triage.service';
import { GroundingValidator, TurnEvidence } from './grounding.validator';
import { LLM_PROVIDER, LlmError, type LlmMessage, type LlmProvider, type LlmResponse } from './llm/llm.types';
import { buildSystemPrompt, buildUserTurn, TERMINAL_REMINDER, TOOL_BUDGET_NOTICE } from './prompts/system';

export interface AgentInput {
  sessionId: string;
  requestId?: string;
  locale: Locale;
  /** Redacted user text for this turn. */
  userText: string;
  /** Prior turns as plain text (redacted), oldest first. */
  history: { role: 'user' | 'assistant'; content: string }[];
  facts: ExtractedFacts;
  triage: TriageResult;
  injection: InjectionScan;
  trace: TraceRecorder;
}

interface Base {
  evidence: TurnEvidence;
  steps: number;
  validationErrors: string[];
}
export type AgentOutcome =
  | (Base & { kind: 'recommendation'; args: SubmitRecommendationArgs; warnings: string[] })
  | (Base & { kind: 'clarification'; args: AskClarifyingQuestionsArgs })
  | (Base & { kind: 'fallback'; reason: FallbackReason });

export type FallbackReason = 'LLM_UNAVAILABLE' | 'AGENT_TIMEOUT' | 'MAX_STEPS' | 'NO_TERMINAL_TOOL' | 'GROUNDING_FAILED';

/** Receives every executed tool call (audit log). Kept as an interface so tests can pass a no-op. */
export interface ToolCallSink {
  logToolCall(entry: { sessionId: string; requestId?: string; execution: ToolExecution }): Promise<void>;
}
export const TOOL_CALL_SINK = Symbol('TOOL_CALL_SINK');

const MAX_REPAIRS = 1;
const MAX_TEXT_NUDGES = 1;

/**
 * AgentOrchestrator — the tool-calling loop.
 *
 *   LLM → (tool calls → validated execution → results)* → terminal tool → GroundingValidator
 *
 * Stop conditions: a valid terminal tool call; tool-step budget (then only terminal tools are
 * offered); global deadline; LLM failure after one retry; repeated free-text answers; a second
 * grounding failure. Every non-success path ends in a typed fallback outcome — never an exception.
 */
@Injectable()
export class AgentOrchestrator {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly tools: ToolRegistry,
    private readonly validator: GroundingValidator,
    @Inject(ENV) private readonly env: Pick<Env, 'AGENT_MAX_TOOL_STEPS' | 'AGENT_TIMEOUT_MS' | 'AGENT_MAX_CLARIFY_ROUNDS' | 'LLM_TEMPERATURE' | 'LLM_CALL_TIMEOUT_MS'>,
    @Optional() @Inject(TOOL_CALL_SINK) private readonly sink?: ToolCallSink,
  ) {}

  get providerName(): string {
    return `${this.llm.name}:${this.llm.model}`;
  }

  async run(input: AgentInput): Promise<AgentOutcome> {
    const { trace } = input;
    const deadline = Date.now() + this.env.AGENT_TIMEOUT_MS;
    const evidence = new TurnEvidence();
    const validationErrors: string[] = [];
    const allowClarify = input.facts.clarificationRounds < this.env.AGENT_MAX_CLARIFY_ROUNDS;
    const system = buildSystemPrompt({ allowClarify });
    const messages: LlmMessage[] = [
      ...input.history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage),
      {
        role: 'user',
        content: buildUserTurn({ text: input.userText, facts: input.facts, locale: input.locale, injectionFlagged: input.injection.flagged }),
      },
    ];
    const vctx = { floor: input.triage.floor, userAmounts: input.facts.budgetUsd ? [input.facts.budgetUsd] : [] };
    const toolCtx = { sessionId: input.sessionId, requestId: input.requestId, locale: input.locale };

    let toolSteps = 0;
    let repairs = 0;
    let nudges = 0;
    let llmCalls = 0;
    const maxLlmCalls = this.env.AGENT_MAX_TOOL_STEPS + MAX_REPAIRS + MAX_TEXT_NUDGES + 1;
    const fallback = (reason: FallbackReason): AgentOutcome => {
      trace.add({ type: 'fallback', name: 'safe_fallback', ok: false, durationMs: 0, summary: { reason } });
      return { kind: 'fallback', reason, evidence, steps: llmCalls, validationErrors };
    };

    while (true) {
      if (Date.now() >= deadline) return fallback('AGENT_TIMEOUT');
      if (llmCalls >= maxLlmCalls) return fallback('MAX_STEPS');

      const budgetExhausted = toolSteps >= this.env.AGENT_MAX_TOOL_STEPS;
      const specs = this.tools.specs((d) => (d.terminal || !budgetExhausted) && (allowClarify || d.name !== TOOL_NAMES.askClarifyingQuestions));

      let response: LlmResponse;
      try {
        llmCalls++;
        response = await this.callLlmWithRetry({ system, messages, tools: specs }, deadline, trace);
      } catch (err) {
        const reason = Date.now() >= deadline ? 'AGENT_TIMEOUT' : 'LLM_UNAVAILABLE';
        trace.add({ type: 'llm', name: 'llm_call', ok: false, durationMs: 0, error: (err as Error).message });
        return fallback(reason);
      }

      // Free-text answers are not accepted: nudge once, then fall back.
      if (!response.toolCalls.length) {
        trace.add({ type: 'validation', name: 'free_text_rejected', ok: false, durationMs: 0, summary: { text: response.text?.slice(0, 200) } });
        if (nudges >= MAX_TEXT_NUDGES) return fallback('NO_TERMINAL_TOOL');
        nudges++;
        messages.push({ role: 'assistant', content: response.text, raw: response.raw });
        messages.push({ role: 'user', content: TERMINAL_REMINDER });
        continue;
      }

      messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls, raw: response.raw });
      const terminal = response.toolCalls.find((c) => this.tools.isTerminal(c.name));

      if (terminal) {
        const started = Date.now();
        const result =
          terminal.name === TOOL_NAMES.submitRecommendation
            ? this.validator.validateRecommendation(terminal.args, evidence, vctx)
            : this.validator.validateClarification(terminal.args, evidence, vctx);
        trace.add({
          type: 'validation',
          name: 'grounding_validator',
          ok: result.ok,
          durationMs: Date.now() - started,
          args: { tool: terminal.name },
          summary: { errors: result.errors, warnings: result.warnings },
        });

        if (result.ok && result.value) {
          if (terminal.name === TOOL_NAMES.submitRecommendation) {
            return { kind: 'recommendation', args: result.value as SubmitRecommendationArgs, warnings: result.warnings, evidence, steps: llmCalls, validationErrors };
          }
          return { kind: 'clarification', args: result.value as AskClarifyingQuestionsArgs, evidence, steps: llmCalls, validationErrors };
        }

        validationErrors.push(...result.errors);
        if (repairs >= MAX_REPAIRS) return fallback('GROUNDING_FAILED');
        repairs++;
        trace.add({ type: 'repair', name: 'repair_retry', ok: true, durationMs: 0, summary: { attempt: repairs } });
        // Every tool_use must get a result; siblings of a terminal call are not executed.
        messages.push({
          role: 'tool',
          results: response.toolCalls.map((c) => ({
            toolCallId: c.id,
            toolName: c.name,
            isError: true,
            content: JSON.stringify(
              c === terminal
                ? { ok: false, error: { code: 'GROUNDING_FAILED', message: 'Submission rejected by the server. Fix these problems and submit again.', details: result.errors } }
                : { ok: false, error: { code: 'NOT_EXECUTED', message: 'Not executed because a terminal tool was called in the same step.' } },
            ),
          })),
        });
        continue;
      }

      // Non-terminal tool calls (executed in parallel; each result goes back to the model).
      if (budgetExhausted) {
        messages.push({
          role: 'tool',
          results: response.toolCalls.map((c) => ({ toolCallId: c.id, toolName: c.name, isError: true, content: JSON.stringify({ ok: false, error: { code: 'TOOL_BUDGET_EXHAUSTED', message: TOOL_BUDGET_NOTICE } }) })),
        });
        continue;
      }
      toolSteps++;
      const executions = await Promise.all(response.toolCalls.map((c) => this.tools.execute(c.name, c.args, toolCtx)));
      for (const exec of executions) {
        evidence.absorb(exec.output.evidence);
        const r = exec.output.result;
        trace.add({
          type: 'tool',
          name: exec.name,
          ok: r.ok,
          durationMs: exec.durationMs,
          args: exec.args,
          summary: summarizeResult(r),
          error: r.ok ? undefined : `${r.error.code}: ${r.error.message}`,
        });
        void this.sink?.logToolCall({ sessionId: input.sessionId, requestId: input.requestId, execution: exec }).catch(() => undefined);
      }
      messages.push({
        role: 'tool',
        results: executions.map((exec, i) => ({
          toolCallId: response.toolCalls[i].id,
          toolName: exec.name,
          isError: !exec.output.result.ok,
          content: JSON.stringify(exec.output.result),
        })),
      });
      if (toolSteps >= this.env.AGENT_MAX_TOOL_STEPS) messages.push({ role: 'user', content: TOOL_BUDGET_NOTICE });
    }
  }

  /** One LLM call bounded by the per-call timeout and the global deadline; one retry on transient errors. */
  private async callLlmWithRetry(
    req: { system: string; messages: LlmMessage[]; tools: ReturnType<ToolRegistry['specs']> },
    deadline: number,
    trace: TraceRecorder,
  ): Promise<LlmResponse> {
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new LlmError('deadline exceeded', false);
      try {
        return await trace.time(
          'llm',
          `llm_call:${this.llm.name}`,
          () =>
            this.llm.complete({
              ...req,
              temperature: this.env.LLM_TEMPERATURE,
              maxTokens: 4096,
              signal: AbortSignal.timeout(Math.min(this.env.LLM_CALL_TIMEOUT_MS, remaining)),
            }),
          (r) => ({ summary: { toolCalls: r.toolCalls.map((c) => c.name), stopReason: r.stopReason, usage: r.usage } }),
        );
      } catch (err) {
        const retryable = err instanceof LlmError ? err.retryable : false;
        if (!retryable || attempt >= 1 || deadline - Date.now() < 1000) throw err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
}
