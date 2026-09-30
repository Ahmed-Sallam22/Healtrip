import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ChatRequest,
  type ChatResponse,
  EMERGENCY_NUMBERS,
  type ExtractedFacts,
  type HospitalHit,
  type Locale,
  TOOL_NAMES,
  type TraceEntry,
} from '@healtrip/shared';
import { AgentOrchestrator, type AgentOutcome } from '../agent/agent.orchestrator';
import { extractFacts, mergeFacts } from '../agent/facts.extractor';
import { PROMPT_VERSION } from '../agent/prompts/system';
import { AuditService } from '../audit/audit.service';
import { t } from '../common/messages';
import { TraceRecorder } from '../common/trace';
import { ENV, type Env } from '../config/env';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ProvidersRepository } from '../providers/providers.repository';
import { SessionsRepository } from '../sessions/sessions.repository';
import { summarizeResult, ToolRegistry } from '../tools/tool-registry';
import { TRIAGE_RULES_VERSION } from '../triage/triage.rules';
import { type TriageResult, TriageService } from '../triage/triage.service';
import { ResponseBuilder } from './response.builder';

const TRIAGE_LOOKBACK_MESSAGES = 3;
const HISTORY_MESSAGES = 10;

/**
 * One chat turn, end to end:
 *   guardrails → session + facts → deterministic triage ─┬─ EMERGENCY → rules-only reply (no LLM)
 *                                                        └─ agent loop → validated outcome → cards from DB
 *   → persist (redacted) → audit
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly guardrails: GuardrailsService,
    private readonly triage: TriageService,
    private readonly agent: AgentOrchestrator,
    private readonly tools: ToolRegistry,
    private readonly sessions: SessionsRepository,
    private readonly providers: ProvidersRepository,
    private readonly builder: ResponseBuilder,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Pick<Env, 'EXPOSE_TRACE'>,
  ) {}

  async handle(req: ChatRequest, opts: { requestId?: string; onTrace?: (e: TraceEntry) => void } = {}): Promise<ChatResponse> {
    const started = Date.now();
    const trace = new TraceRecorder(this.env.EXPOSE_TRACE ? opts.onTrace : undefined);
    const { locale } = req;

    // 1) Guardrails: redact PII, flag injection. Only the redacted text is used from here on.
    const guarded = this.guardrails.inspect(req.message);
    trace.add({
      type: 'guardrail',
      name: 'input_guardrails',
      ok: true,
      durationMs: 0,
      summary: { redactions: guarded.redactions, injectionFlagged: guarded.injection.flagged, injectionPatterns: guarded.injection.patterns, truncated: guarded.truncated },
    });

    // 2) Session + structured memory.
    const existing = req.sessionId ? await this.sessions.find(req.sessionId) : null;
    if (req.sessionId && !existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
    const session = existing ?? (await this.sessions.create(locale, { symptoms: [], clarificationRounds: 0 }));
    const history = await this.sessions.messages(session.id, HISTORY_MESSAGES);
    const keywords = (await this.providers.listSymptomMappings()).map((m) => m.symptomKeyword);
    let facts = mergeFacts(session.facts, extractFacts(guarded.text, keywords));

    // 3) Deterministic triage over this + recent user messages (mid-conversation escalation).
    const recentUser = history.filter((m) => m.role === 'user').slice(-TRIAGE_LOOKBACK_MESSAGES).map((m) => m.content);
    const triage = this.triage.evaluate([...recentUser, guarded.text], facts);
    trace.add({
      type: 'triage',
      name: 'red_flag_rules',
      ok: true,
      durationMs: 0,
      summary: { level: triage.level, floor: triage.floor, rules: triage.matches.map((m) => m.ruleId), version: TRIAGE_RULES_VERSION },
    });

    await this.sessions.appendMessage(session.id, { role: 'user', content: guarded.text });

    let response: Omit<ChatResponse, 'sessionId' | 'messageId' | 'trace'>;
    let outcome: AgentOutcome | null = null;
    if (triage.level === 'EMERGENCY') {
      response = await this.emergencyResponse(triage, facts, locale, session.id, opts.requestId, trace);
    } else {
      outcome = await this.agent.run({
        sessionId: session.id,
        requestId: opts.requestId,
        locale,
        userText: guarded.text,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        facts,
        triage,
        injection: guarded.injection,
        trace,
      });
      if (outcome.kind !== 'fallback') facts = mergeFacts(facts, outcome.args.facts);
      if (outcome.kind === 'clarification') facts = { ...facts, clarificationRounds: facts.clarificationRounds + 1 };
      response = await this.agentResponse(outcome, triage, facts, locale, session.id, opts.requestId, trace);
    }

    const payload = { ...response, sessionId: session.id, messageId: '', trace: this.env.EXPOSE_TRACE ? trace.entries : [] };
    const saved = await this.sessions.appendMessage(session.id, { role: 'assistant', content: response.reply, payload });
    await this.sessions.updateFacts(session.id, facts, locale);
    void this.audit.logAgentRun({
      sessionId: session.id,
      requestId: opts.requestId,
      source: response.source,
      nextStep: response.nextStep,
      providerIds: response.providers.map((p) => p.id),
      citations: response.citations.map((c) => c.chunkId),
      validationErrors: outcome?.validationErrors ?? [],
      llmProvider: response.source === 'triage' ? 'none' : this.agent.providerName,
      promptVersion: PROMPT_VERSION,
      steps: outcome?.steps ?? 0,
      latencyMs: Date.now() - started,
    });
    return { ...payload, messageId: saved.id };
  }

  /** Emergency path: fixed wording, ER hospitals via the same audited tool — never the LLM. */
  private async emergencyResponse(triage: TriageResult, facts: ExtractedFacts, locale: Locale, sessionId: string, requestId: string | undefined, trace: TraceRecorder) {
    const hospitals = await this.runTool(TOOL_NAMES.findEmergencyHospitals, facts.city ? { city: facts.city } : {}, locale, sessionId, requestId, trace);
    const selfHarm = triage.matches.some((m) => m.ruleId === 'suicidal_ideation');
    const numbers = EMERGENCY_NUMBERS[facts.country === 'TR' ? 'TR' : 'EG'].map((n) => ({ label: locale === 'ar' ? n.labelAr : n.labelEn, number: n.number }));
    const labels = triage.matches.map((m) => m.label);
    return {
      reply: `${t(selfHarm ? 'emergencySelfHarm' : 'emergency', locale)}\n\n${numbers.map((n) => `${n.label}: ${n.number}`).join(' · ')}`,
      reasoning: t('emergencyReason', locale)(labels),
      disclaimer: t('disclaimer', locale),
      nextStep: 'EMERGENCY_NOW' as const,
      urgency: 'critical' as const,
      providers: await this.hospitalCardsFromHits(hospitals, locale),
      clarifyingQuestions: [],
      citations: [],
      emergency: { numbers, matchedRules: triage.matches.map((m) => m.ruleId) },
      source: 'triage' as const,
      promptVersion: PROMPT_VERSION,
    };
  }

  private async agentResponse(outcome: AgentOutcome, triage: TriageResult, facts: ExtractedFacts, locale: Locale, sessionId: string, requestId: string | undefined, trace: TraceRecorder) {
    const common = { disclaimer: t('disclaimer', locale), promptVersion: PROMPT_VERSION, emergency: null };
    if (outcome.kind === 'clarification') {
      return {
        ...common,
        reply: outcome.args.message ?? t('clarifyLead', locale),
        reasoning: null,
        nextStep: null,
        urgency: null,
        providers: [],
        clarifyingQuestions: outcome.args.questions,
        citations: [],
        source: 'agent' as const,
      };
    }
    if (outcome.kind === 'recommendation') {
      const { args } = outcome;
      return {
        ...common,
        reply: args.message,
        reasoning: args.reasoning,
        nextStep: args.nextStep,
        urgency: args.urgency,
        providers: await this.builder.providerCards(args.providers, locale),
        clarifyingQuestions: args.followUpQuestions ?? [],
        citations: this.builder.citations(args.citations, outcome.evidence),
        emergency:
          args.nextStep === 'EMERGENCY_NOW'
            ? { numbers: EMERGENCY_NUMBERS.DEFAULT.map((n) => ({ label: locale === 'ar' ? n.labelAr : n.labelEn, number: n.number })), matchedRules: triage.matches.map((m) => m.ruleId) }
            : null,
        source: 'agent' as const,
      };
    }
    // Safe fallback: no model text at all; 24h hospitals from the DB so the patient has a next action.
    const hospitals = await this.runTool(TOOL_NAMES.findEmergencyHospitals, facts.city ? { city: facts.city } : {}, locale, sessionId, requestId, trace);
    return {
      ...common,
      reply: t('fallback', locale),
      reasoning: t('fallbackReason', locale)(outcome.reason),
      nextStep: triage.floor ?? ('GENERAL_PRACTITIONER' as const),
      urgency: triage.floor ? ('high' as const) : ('medium' as const),
      providers: await this.hospitalCardsFromHits(hospitals, locale),
      clarifyingQuestions: [],
      citations: [],
      source: 'fallback' as const,
    };
  }

  /** Server-initiated tool calls go through the same registry → validated, traced, audited. */
  private async runTool(name: string, args: unknown, locale: Locale, sessionId: string, requestId: string | undefined, trace: TraceRecorder) {
    const exec = await this.tools.execute(name, args, { sessionId, requestId, locale });
    const r = exec.output.result;
    trace.add({ type: 'tool', name, ok: r.ok, durationMs: exec.durationMs, args: exec.args, summary: summarizeResult(r), error: r.ok ? undefined : r.error.message });
    void this.audit.logToolCall({ sessionId, requestId, execution: exec });
    return r.ok ? ((r.data as { hospitals: HospitalHit[] }).hospitals ?? []) : [];
  }

  private async hospitalCardsFromHits(hits: HospitalHit[], locale: Locale) {
    const records = await this.providers.findHospitalsByIds(hits.map((h) => h.id));
    const ordered = hits.flatMap((h) => records.filter((r) => r.id === h.id));
    return this.builder.hospitalCards(ordered, locale, t('hospitalMatch', locale));
  }
}
