import { AgentOrchestrator } from '../agent/agent.orchestrator';
import { GroundingValidator } from '../agent/grounding.validator';
import { MockLlmProvider } from '../agent/llm/mock.provider';
import type { AuditService } from '../audit/audit.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { buildToolRegistry } from '../tools/tool-registry.factory';
import { TriageService } from '../triage/triage.service';
import { demoRag, TEST_ENV } from '../../test/support/agent-harness';
import { InMemoryProvidersRepository } from '../../test/support/in-memory.repository';
import { InMemorySessionsRepository } from '../../test/support/in-memory.sessions';
import { ChatService } from './chat.service';
import { ResponseBuilder } from './response.builder';

function setup() {
  const repo = new InMemoryProvidersRepository();
  const sessions = new InMemorySessionsRepository();
  const llm = new MockLlmProvider();
  const complete = jest.spyOn(llm, 'complete');
  const registry = buildToolRegistry(repo, demoRag());
  const audit = { logToolCall: jest.fn().mockResolvedValue(undefined), logAgentRun: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const agent = new AgentOrchestrator(llm, registry, new GroundingValidator(), TEST_ENV);
  const chat = new ChatService(new GuardrailsService(), new TriageService(), agent, registry, sessions, repo, new ResponseBuilder(repo), audit, { EXPOSE_TRACE: true });
  return { chat, sessions, complete, audit };
}

describe('ChatService (full turn pipeline, in-memory)', () => {
  it('emergency red flags short-circuit to EMERGENCY_NOW with ER hospitals — the LLM is never called', async () => {
    const { chat, complete } = setup();
    const r = await chat.handle({ message: 'Chest pain spreading to my left arm and sweating, I am in Cairo', locale: 'en' });
    expect(complete).not.toHaveBeenCalled();
    expect(r).toMatchObject({ source: 'triage', nextStep: 'EMERGENCY_NOW', urgency: 'critical' });
    expect(r.emergency?.numbers.map((n) => n.number)).toEqual(['123', '112']);
    expect(r.providers.length).toBeGreaterThan(0);
    expect(r.providers.every((p) => p.kind === 'hospital' && p.hasEmergency && p.city === 'Cairo')).toBe(true);
  });

  it('never stores raw PII: the persisted user message is redacted', async () => {
    const { chat, sessions } = setup();
    const r = await chat.handle({ message: 'I need a dermatologist, call me at 01012345678', locale: 'en' });
    const stored = await sessions.messages(r.sessionId);
    expect(stored[0].content).toContain('[PHONE]');
    expect(JSON.stringify(stored)).not.toContain('01012345678');
  });

  it('keeps session memory across turns and renders provider cards from DB records', async () => {
    const { chat, sessions } = setup();
    const first = await chat.handle({ message: 'I have mild chest pain', locale: 'en' });
    expect(first.clarifyingQuestions.length).toBeGreaterThan(0);
    const second = await chat.handle({ sessionId: first.sessionId, message: '2 weeks, 3/10, no sweating, I live in Cairo', locale: 'en' });
    expect(second.nextStep).toBe('BOOK_SPECIALIST');
    const card = second.providers[0];
    expect(card).toMatchObject({ kind: 'doctor', specialty: { code: 'CARDIOLOGY' }, hospital: { city: 'Cairo' } });
    const facts = (await sessions.find(first.sessionId))!.facts;
    expect(facts).toMatchObject({ city: 'Cairo', durationDays: 14, severity: 3, clarificationRounds: 1 });
  });

  it('answers in Arabic for Arabic input with the Arabic disclaimer', async () => {
    const { chat } = setup();
    const r = await chat.handle({ message: 'أحتاج طبيب جلدية في الإسكندرية', locale: 'ar' });
    expect(r.reply).toMatch(/[؀-ۿ]/);
    expect(r.disclaimer).toMatch(/ليست نصيحة طبية/);
    expect(r.providers[0]?.name).toMatch(/[؀-ۿ]/);
  });

  it('a hallucinating model ends in the safe fallback with real 24h hospitals, not model text', async () => {
    const repo = new InMemoryProvidersRepository();
    const sessions = new InMemorySessionsRepository();
    const registry = buildToolRegistry(repo, demoRag());
    const liar = new MockLlmProvider(() => ({
      text: null,
      stopReason: 'tool_use',
      toolCalls: [{ id: 'x', name: 'submit_recommendation', args: { nextStep: 'BOOK_SPECIALIST', urgency: 'low', message: 'See Dr. Invented in Paris for $5', reasoning: 'trust me', providers: [{ providerId: 'doc-par-fake-01', matchReason: 'best' }], citations: [], disclaimerShown: true } }],
    }));
    const audit = { logToolCall: jest.fn().mockResolvedValue(undefined), logAgentRun: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const chat = new ChatService(new GuardrailsService(), new TriageService(), new AgentOrchestrator(liar, registry, new GroundingValidator(), TEST_ENV), registry, sessions, repo, new ResponseBuilder(repo), audit, { EXPOSE_TRACE: true });
    const r = await chat.handle({ message: 'I need a doctor in Cairo', locale: 'en' });
    expect(r.source).toBe('fallback');
    expect(r.reply).not.toMatch(/Invented|Paris/);
    expect(r.providers.every((p) => p.kind === 'hospital' && repo.hospitals.some((h) => h.id === p.id))).toBe(true);
  });
});
