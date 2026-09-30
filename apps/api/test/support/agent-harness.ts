import { emptyFacts, type ExtractedFacts, type Locale } from '@healtrip/shared';
import { AgentOrchestrator } from '../../src/agent/agent.orchestrator';
import { extractFacts, mergeFacts } from '../../src/agent/facts.extractor';
import { GroundingValidator } from '../../src/agent/grounding.validator';
import type { LlmProvider } from '../../src/agent/llm/llm.types';
import { MockLlmProvider } from '../../src/agent/llm/mock.provider';
import { TraceRecorder } from '../../src/common/trace';
import { scanForInjection } from '../../src/guardrails/injection';
import { buildToolRegistry } from '../../src/tools/tool-registry.factory';
import { TriageService } from '../../src/triage/triage.service';
import { chunk, FakeRag } from './fake-rag';
import { InMemoryProvidersRepository } from './in-memory.repository';

export const TEST_ENV = {
  AGENT_MAX_TOOL_STEPS: 5,
  AGENT_TIMEOUT_MS: 5000,
  AGENT_MAX_CLARIFY_ROUNDS: 3,
  LLM_TEMPERATURE: 0.1,
  LLM_CALL_TIMEOUT_MS: 2000,
};

/** Scripted RAG results that mirror what the real service returns for the demo queries. */
export function demoRag() {
  return new FakeRag((req) => {
    const q = req.query.toLowerCase();
    if (q.includes('stent'))
      return [
        chunk({ chunkId: 'doctor_bio:doc-cai-card-01:en#0', sourceType: 'doctor_bio', sourceId: 'doc-cai-card-01', title: 'Dr. Karim Fawzy — Cardiology', text: 'Interventional cardiologist... heart stent (PCI) procedures.' }),
        chunk({ chunkId: 'doctor_bio:doc-ist-card-01:en#0', sourceType: 'doctor_bio', sourceId: 'doc-ist-card-01', title: 'Dr. Emre Yilmaz — Cardiology', text: 'Complex coronary stenting with drug-eluting stents.' }),
      ];
    if (q.includes('second opinion') || q.includes('الرأي') || q.includes('الثاني'))
      return [
        chunk({
          chunkId: `patient_guide:second-opinion:${req.locale}#0`, sourceType: 'patient_guide', locale: req.locale,
          title: req.locale === 'ar' ? 'كيف يعمل الرأي الطبي الثاني في هيلتريب' : 'How a second opinion works at HealTrip',
          text: req.locale === 'ar'
            ? 'محتوى تجريبي لنموذج أولي. ترسل تقاريرك وصور الأشعة، ثم يراجعها طبيب متخصص عن بُعد أو حضوريًا. تصلك النتيجة عادة خلال 3 إلى 5 أيام عمل.'
            : 'Sample content for a prototype. You share your reports and imaging, then a specialist reviews them remotely or in person. You usually receive a written opinion within 3–5 working days.',
        }),
      ];
    return [];
  });
}

export function makeAgent(opts: { llm?: LlmProvider; rag?: FakeRag } = {}) {
  const repo = new InMemoryProvidersRepository();
  const rag = opts.rag ?? demoRag();
  const registry = buildToolRegistry(repo, rag);
  const agent = new AgentOrchestrator(opts.llm ?? new MockLlmProvider(), registry, new GroundingValidator(), TEST_ENV);
  const triage = new TriageService();

  /** Runs one turn like ChatService does (facts → triage → agent), without the DB. */
  async function turn(text: string, locale: Locale, state: { facts: ExtractedFacts; history: { role: 'user' | 'assistant'; content: string }[] }) {
    const symptomKeywords = (await repo.listSymptomMappings()).map((m) => m.symptomKeyword);
    state.facts = mergeFacts(state.facts, extractFacts(text, symptomKeywords));
    const trace = new TraceRecorder();
    const outcome = await agent.run({
      sessionId: 's1', locale, userText: text, history: state.history, facts: state.facts,
      triage: triage.evaluate([text], state.facts), injection: scanForInjection(text), trace,
    });
    if (outcome.kind === 'clarification') state.facts = { ...state.facts, clarificationRounds: state.facts.clarificationRounds + 1 };
    state.history.push({ role: 'user', content: text }, { role: 'assistant', content: outcome.kind === 'fallback' ? 'fallback' : (outcome.args.message ?? '') });
    return { outcome, trace };
  }

  return { repo, rag, agent, turn, newState: () => ({ facts: emptyFacts(), history: [] as { role: 'user' | 'assistant'; content: string }[] }) };
}
