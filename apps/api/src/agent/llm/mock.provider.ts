import {
  type DoctorHit,
  type ExtractedFacts,
  type KnowledgeChunk,
  type Locale,
  type NextStep,
  type SpecialtyMatch,
  TOOL_NAMES,
  type ToolResult,
  type Urgency,
} from '@healtrip/shared';
import { normalizeText } from '../../common/text';
import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from './llm.types';

/**
 * MockLlmProvider — a deterministic, scripted "model" so the full system (agent loop, tools,
 * grounding validator, UI) runs and is testable WITHOUT an API key.
 *
 * It is not an LLM: it is a small rule-based policy that reads the same inputs a real model gets
 * (the envelope in the user turn + tool results) and emits the same outputs (tool calls). It goes
 * through exactly the same orchestrator, tool registry and validator as Anthropic/OpenAI.
 *
 * Tests can inject a custom `script` to simulate misbehaving models (e.g. fake provider ids).
 */
export type MockScript = (req: LlmRequest, turn: TurnView) => LlmResponse | Promise<LlmResponse>;

interface ToolExchange {
  call: LlmToolCall;
  result: ToolResult<unknown>;
}

export interface TurnView {
  userText: string;
  facts: ExtractedFacts;
  locale: Locale;
  injectionFlagged: boolean;
  exchanges: ToolExchange[];
  availableTools: string[];
}

let callCounter = 0;
const call = (name: string, args: unknown): LlmResponse => ({
  text: null,
  toolCalls: [{ id: `mock_call_${++callCounter}`, name, args }],
  stopReason: 'tool_use',
});

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-navigator-v1';

  constructor(private readonly script?: MockScript) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const turn = readTurn(req);
    if (this.script) return this.script(req, turn);
    return defaultPolicy(turn);
  }
}

// ---------------------------------------------------------------------------
// Reading the conversation like a model would
// ---------------------------------------------------------------------------

export function readTurn(req: LlmRequest): TurnView {
  const msgs = req.messages;
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'user' && m.content.includes('<user_message>')) {
      lastUserIdx = i;
      break;
    }
  }
  const envelope = lastUserIdx >= 0 ? (msgs[lastUserIdx] as { content: string }).content : '';
  const facts = JSON.parse(envelope.match(/<session_facts>([\s\S]*?)<\/session_facts>/)?.[1] ?? '{"symptoms":[],"clarificationRounds":0}') as ExtractedFacts;
  const locale = (envelope.match(/<locale>(ar|en)<\/locale>/)?.[1] ?? 'en') as Locale;
  const userText = envelope.match(/<user_message>\n?([\s\S]*?)\n?<\/user_message>/)?.[1] ?? '';

  const exchanges: ToolExchange[] = [];
  const pending = new Map<string, LlmToolCall>();
  for (const m of msgs.slice(lastUserIdx + 1) as LlmMessage[]) {
    if (m.role === 'assistant') m.toolCalls?.forEach((c) => pending.set(c.id, c));
    if (m.role === 'tool')
      for (const r of m.results) {
        const c = pending.get(r.toolCallId);
        if (c) exchanges.push({ call: c, result: JSON.parse(r.content) as ToolResult<unknown> });
      }
  }
  return {
    userText,
    facts,
    locale,
    injectionFlagged: envelope.includes('<guardrail_notice>'),
    exchanges,
    availableTools: req.tools.map((t) => t.name),
  };
}

// ---------------------------------------------------------------------------
// Default policy
// ---------------------------------------------------------------------------

const EXPLICIT_SPECIALTIES: [RegExp, string][] = [
  [/cardiolog|heart doctor|heart specialist|طبيب قلب|دكتور قلب|اخصائي قلب|امراض القلب/, 'CARDIOLOGY'],
  [/orthop|bone doctor|جراح عظام|دكتور عظام|طبيب عظام/, 'ORTHOPEDICS'],
  [/neurolog|دكتور اعصاب|طبيب اعصاب/, 'NEUROLOGY'],
  [/dermatolog|skin doctor|دكتور جلديه|طبيب جلديه/, 'DERMATOLOGY'],
  [/gastroenterolog|دكتور باطنه|جهاز هضمي/, 'GASTROENTEROLOGY'],
  [/pulmonolog|chest physician|دكتور صدر/, 'PULMONOLOGY'],
  [/oncolog|دكتور اورام/, 'ONCOLOGY'],
  [/psychiatr|طبيب نفسي|دكتور نفسي/, 'PSYCHIATRY'],
  [/endocrinolog|دكتور غدد/, 'ENDOCRINOLOGY'],
  [/general practitioner|family doctor|\bgp\b|ممارس عام|طبيب اسره|دكتور اسره/, 'GENERAL_PRACTICE'],
];

const KNOWLEDGE_QUESTION = /\b(?:experience (?:with|in)|how does|how do|what is the process|process work|explain|what happens|do you know|does .{2,40} (?:have|offer)|tell me about)\b|كيف|ما هي|ماهي|خبره في|اشرح|هل يوجد|هل لدي/;
const CHEST_LIKE = /chest|صدر|heart|قلب|palpitation|خفقان/;

function defaultPolicy(t: TurnView): LlmResponse {
  const text = normalizeText(t.userText);
  const tr = T[t.locale];
  const last = t.exchanges[t.exchanges.length - 1];
  const onlyTerminal = !t.availableTools.includes(TOOL_NAMES.searchProviders);
  const explicit = EXPLICIT_SPECIALTIES.find(([re]) => re.test(text))?.[1];

  // Repair path: the server rejected our terminal call → resubmit from evidence only.
  if (last && last.call.name === TOOL_NAMES.submitRecommendation) return submitFromEvidence(t, explicit);
  if (onlyTerminal) return submitFromEvidence(t, explicit);

  // Prompt injection: decline the injected part, stay within the rules, never invent.
  if (t.injectionFlagged && !t.exchanges.length) {
    return call(TOOL_NAMES.submitRecommendation, {
      nextStep: 'GENERAL_PRACTITIONER',
      urgency: 'low',
      message: tr.injection,
      reasoning: tr.injectionReason,
      providers: [],
      citations: [],
      disclaimerShown: true,
    });
  }

  const called = (name: string) => t.exchanges.filter((e) => e.call.name === name);

  // 1) Unstructured question → knowledge base first.
  const isKnowledge = KNOWLEDGE_QUESTION.test(text);
  if (isKnowledge && !called(TOOL_NAMES.searchKnowledgeBase).length) {
    return call(TOOL_NAMES.searchKnowledgeBase, { query: t.userText.slice(0, 400), locale: t.locale });
  }
  if (isKnowledge) {
    const kb = called(TOOL_NAMES.searchKnowledgeBase)[0].result;
    const chunks = kb.ok ? ((kb.data as { chunks: KnowledgeChunk[] }).chunks ?? []) : [];
    const needsDoctors = chunks.some((c) => c.sourceType === 'doctor_bio') || (!kb.ok && explicit);
    if (needsDoctors && explicit && !called(TOOL_NAMES.searchProviders).length) {
      return call(TOOL_NAMES.searchProviders, compact({ specialtyCode: explicit, city: t.facts.city }));
    }
    if (!called(TOOL_NAMES.searchProviders).length) return answerFromKnowledge(t, kb, chunks);
    return submitFromEvidence(t, explicit);
  }

  // 2) Navigation flow: clarify only what changes the decision.
  if (!t.exchanges.length) {
    const questions = clarifyingQuestions(t, explicit);
    if (questions.length && t.availableTools.includes(TOOL_NAMES.askClarifyingQuestions)) {
      return call(TOOL_NAMES.askClarifyingQuestions, { questions: questions.map((q) => q.text), missingFacts: questions.map((q) => q.fact), message: tr.clarifyLead });
    }
    if (explicit) return call(TOOL_NAMES.searchProviders, providerFilters(t, explicit));
    if (t.facts.symptoms.length) return call(TOOL_NAMES.mapSymptoms, { symptoms: t.facts.symptoms.slice(0, 10) });
    return call(TOOL_NAMES.searchProviders, providerFilters(t, 'GENERAL_PRACTICE'));
  }

  if (last.call.name === TOOL_NAMES.mapSymptoms) {
    const matches = last.result.ok ? (last.result.data as { matches: SpecialtyMatch[] }).matches : [];
    return call(TOOL_NAMES.searchProviders, providerFilters(t, matches[0]?.specialtyCode ?? 'GENERAL_PRACTICE'));
  }

  if (last.call.name === TOOL_NAMES.searchProviders) {
    const providers = last.result.ok ? ((last.result.data as { providers: DoctorHit[] }).providers ?? []) : [];
    const args = last.call.args as Record<string, unknown>;
    const widenable = args.maxFeeUsd !== undefined || args.language !== undefined;
    if (!providers.length && widenable && called(TOOL_NAMES.searchProviders).length === 1) {
      const { maxFeeUsd: _fee, language: _lang, ...wider } = args;
      return call(TOOL_NAMES.searchProviders, wider);
    }
  }
  return submitFromEvidence(t, explicit);
}

function clarifyingQuestions(t: TurnView, explicit?: string): { fact: string; text: string }[] {
  const tr = T[t.locale];
  const f = t.facts;
  const out: { fact: string; text: string }[] = [];
  if (f.wantsSecondOpinion || f.hasDiagnosis) {
    if (!explicit && !f.symptoms.length && !f.diagnosis) out.push({ fact: 'condition', text: tr.qCondition });
    return out;
  }
  if (explicit) return out; // patient already knows which specialist they want
  if (!f.symptoms.length) return [{ fact: 'symptoms', text: tr.qSymptoms }];
  if (f.clarificationRounds >= 1) return out; // enough to decide; search without optional filters
  if (f.durationDays === undefined || f.severity === undefined) out.push({ fact: 'duration_severity', text: tr.qDuration });
  if (f.symptoms.some((s) => CHEST_LIKE.test(normalizeText(s)))) out.push({ fact: 'red_flags', text: tr.qRedFlags });
  else if (!f.city) out.push({ fact: 'city', text: tr.qCity });
  return out.slice(0, 2);
}

function providerFilters(t: TurnView, specialtyCode: string) {
  const f = t.facts;
  return compact({
    specialtyCode,
    city: f.city,
    maxFeeUsd: f.budgetUsd,
    language: f.preferredLanguage,
    secondOpinion: f.wantsSecondOpinion || undefined,
    telemedicine: f.wantsTelemedicine || undefined,
    limit: 3,
  });
}

function answerFromKnowledge(t: TurnView, kb: ToolResult<unknown>, chunks: KnowledgeChunk[]): LlmResponse {
  const tr = T[t.locale];
  const f = t.facts;
  const nextStep: NextStep = f.wantsSecondOpinion ? 'SECOND_OPINION' : 'GENERAL_PRACTITIONER';
  if (!kb.ok || !chunks.length) {
    return call(TOOL_NAMES.submitRecommendation, {
      nextStep, urgency: 'low', providers: [], citations: [], disclaimerShown: true,
      message: kb.ok ? tr.noInfo : tr.kbDown,
      reasoning: kb.ok ? tr.noInfoReason : tr.kbDownReason,
    });
  }
  // Guides are general articles; for profile/bio chunks, a name match alone does not answer the
  // question ("does X have parking?"), so require the question's other key terms to appear.
  const relevant = chunks.filter((c) => c.sourceType === 'patient_guide' || coversFocusTerms(t.userText, c));
  if (!relevant.length) return answerFromKnowledge(t, kb, []);
  const top = relevant.filter((c) => c.sourceType === 'patient_guide').slice(0, 2);
  const used = top.length ? top : relevant.slice(0, 1);
  return call(TOOL_NAMES.submitRecommendation, {
    nextStep,
    urgency: 'low',
    message: `${tr.accordingTo(used[0].title)} ${summarize(used[0].text)}`,
    reasoning: tr.kbReason,
    providers: [],
    citations: used.map((c) => c.chunkId),
    disclaimerShown: true,
  });
}

/** Builds the final recommendation strictly from this turn's tool results. */
function submitFromEvidence(t: TurnView, explicit?: string): LlmResponse {
  const tr = T[t.locale];
  const f = t.facts;
  const doctors = new Map<string, DoctorHit>();
  const chunks: KnowledgeChunk[] = [];
  let urgencyHint = 'routine';
  let specialty = explicit;
  for (const e of t.exchanges) {
    if (!e.result.ok) continue;
    const d = e.result.data as { providers?: DoctorHit[]; chunks?: KnowledgeChunk[]; matches?: SpecialtyMatch[] };
    d.providers?.forEach((p) => doctors.set(p.id, p));
    if (d.chunks) chunks.push(...d.chunks);
    if (d.matches?.[0]) {
      urgencyHint = d.matches[0].urgencyHint;
      specialty ??= d.matches[0].specialtyCode;
    }
  }

  // If bios were retrieved, only recommend doctors whose bio matched AND whose DB record we have.
  const bioChunks = chunks.filter((c) => c.sourceType === 'doctor_bio' && c.sourceId && doctors.has(c.sourceId));
  const chosen = bioChunks.length ? [...new Set(bioChunks.map((c) => c.sourceId!))].map((id) => doctors.get(id)!) : [...doctors.values()].slice(0, 3);

  let nextStep: NextStep = 'BOOK_SPECIALIST';
  let urgency: Urgency = urgencyHint === 'urgent-evaluate' ? 'medium' : 'low';
  if (f.wantsSecondOpinion) nextStep = 'SECOND_OPINION';
  else if (specialty === 'GENERAL_PRACTICE') nextStep = 'GENERAL_PRACTITIONER';
  else if (urgencyHint === 'urgent-evaluate' && ((f.severity ?? 0) >= 6 || (f.durationDays ?? 99) <= 1)) {
    nextStep = 'URGENT_CARE_24H';
    urgency = 'high';
  }

  const message = chosen.length
    ? tr.found(chosen.length, f.city)
    : t.exchanges.some((e) => !e.result.ok && (e.result as { error: { code: string } }).error.code === 'RAG_UNAVAILABLE')
      ? tr.kbDown
      : tr.none;

  return call(TOOL_NAMES.submitRecommendation, {
    nextStep,
    urgency,
    message,
    reasoning: tr.reason(nextStep, f),
    providers: chosen.map((d) => ({ providerId: d.id, matchReason: tr.match(d, bioChunks.some((c) => c.sourceId === d.id)) })),
    citations: bioChunks.filter((c) => chosen.some((d) => d.id === c.sourceId)).map((c) => c.chunkId),
    disclaimerShown: true,
  });
}

function summarize(text: string): string {
  const sentences = text
    .replace(/^.*(?:sample content|محتوى تجريبي|fictional|خيالي).*$/gim, '')
    .replace(/^#+\s.*$/gm, '')
    .split(/(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  return sentences.slice(0, 3).join(' ');
}

const FOCUS_STOPWORDS = new Set(['does', 'have', 'offer', 'offers', 'what', 'which', 'where', 'there', 'with', 'about', 'tell', 'know', 'hospital', 'clinic', 'doctor', 'their', 'this', 'that', 'your', 'from', 'please', 'يوجد', 'لديه', 'لديها', 'مستشفي', 'عياده', 'طبيب', 'دكتور', 'هناك', 'فيها', 'عندهم']);

function tokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.replace(/^(?:وال|بال|ال)/, ''))
    .filter((w) => w.length >= 4 && !FOCUS_STOPWORDS.has(w));
}

function coversFocusTerms(question: string, chunk: KnowledgeChunk): boolean {
  const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));
  const titleStems = new Set(tokens(chunk.title).map(stem));
  const focus = tokens(question).filter((w) => !titleStems.has(stem(w)));
  if (!focus.length) return true;
  const body = normalizeText(chunk.text);
  return focus.filter((w) => body.includes(stem(w))).length / focus.length >= 0.5;
}

function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ---------------------------------------------------------------------------
// Localised templates (the mock never writes provider facts it did not get from tools)
// ---------------------------------------------------------------------------

const STEP_LABEL: Record<Locale, Record<NextStep, string>> = {
  en: {
    EMERGENCY_NOW: 'emergency care now', URGENT_CARE_24H: 'urgent care within 24 hours', BOOK_SPECIALIST: 'booking a specialist',
    SECOND_OPINION: 'a second opinion', GENERAL_PRACTITIONER: 'seeing a general practitioner', SELF_CARE_MONITOR: 'self-care and monitoring',
  },
  ar: {
    EMERGENCY_NOW: 'الطوارئ فورًا', URGENT_CARE_24H: 'رعاية عاجلة خلال 24 ساعة', BOOK_SPECIALIST: 'حجز موعد مع طبيب متخصص',
    SECOND_OPINION: 'الحصول على رأي طبي ثانٍ', GENERAL_PRACTITIONER: 'زيارة طبيب عام', SELF_CARE_MONITOR: 'الرعاية الذاتية والمتابعة',
  },
};

const LANG_AR: Record<string, string> = { ar: 'العربية', en: 'الإنجليزية', tr: 'التركية', fr: 'الفرنسية', de: 'الألمانية' };
const CITY_AR: Record<string, string> = { Cairo: 'القاهرة', Giza: 'الجيزة', Alexandria: 'الإسكندرية', Istanbul: 'إسطنبول' };

const T = {
  en: {
    clarifyLead: 'To point you to the right next step, I need a little more information:',
    qSymptoms: 'What symptoms are you experiencing, and for how long?',
    qDuration: 'How long have you had this, and how strong is it on a scale from 1 to 10?',
    qRedFlags: 'Does the pain spread to your arm, jaw or back, or come with sweating, shortness of breath or fainting?',
    qCity: 'Which city are you in (or planning to travel to)?',
    qCondition: 'Which condition or procedure would you like the second opinion about?',
    injection:
      "I can't do that. I only share doctors and hospitals that exist in HealTrip's database, and I never invent providers, prices or ratings. HealTrip currently covers Cairo, Giza, Alexandria and Istanbul. Tell me your symptoms or the specialist you need and I'll search our network.",
    injectionReason: 'The request asked to bypass the rules and invent data, which is not allowed.',
    noInfo: "I don't have that information in HealTrip's knowledge base, so I won't guess. You can ask the hospital directly, or ask me about doctors, specialties or how HealTrip's services work.",
    noInfoReason: 'No knowledge-base article matched the question closely enough.',
    kbDown: "Our knowledge base is temporarily unavailable, so I can't answer that part right now. I can still search doctors and hospitals for you.",
    kbDownReason: 'Knowledge base unavailable; answered with database tools only.',
    kbReason: "Answer based on HealTrip's patient guide (see source).",
    accordingTo: (title: string) => `According to HealTrip's guide "${title}":`,
    found: (n: number, city?: string) => `I found ${n} matching option${n > 1 ? 's' : ''} in our network${city ? ` in ${city}` : ''}. The details below come directly from our database.`,
    none: "I couldn't find a matching doctor in our network with those filters. Try widening them (for example a different city or a higher budget) — I won't suggest providers that aren't in our database.",
    reason: (s: NextStep, f: ExtractedFacts) => {
      const parts = [f.symptoms.length ? `symptoms: ${f.symptoms.join(', ')}` : '', f.durationDays !== undefined ? `for ~${f.durationDays} day(s)` : '', f.severity ? `severity ${f.severity}/10` : '', f.wantsSecondOpinion ? 'you asked for a second opinion' : ''].filter(Boolean);
      return `Suggested next step: ${STEP_LABEL.en[s]}${parts.length ? ` (${parts.join(', ')})` : ''}. No emergency warning signs were reported.`;
    },
    match: (d: DoctorHit, bio: boolean) =>
      [`${d.specialtyCode.toLowerCase().replace('_', ' ')} in ${d.city}`, `$${d.consultationFeeUsd} consultation`, `rating ${d.rating}`, `speaks ${d.languages.join('/')}`,
        d.offersSecondOpinion ? 'offers second opinions' : '', d.offersTelemedicine ? 'telemedicine available' : '', bio ? 'relevant experience in profile (see source)' : '']
        .filter(Boolean).join(' · '),
  },
  ar: {
    clarifyLead: 'حتى أرشدك إلى الخطوة المناسبة، أحتاج إلى بعض المعلومات:',
    qSymptoms: 'ما الأعراض التي تشعر بها، ومنذ متى؟',
    qDuration: 'منذ متى تشعر بهذا، وما شدته على مقياس من 1 إلى 10؟',
    qRedFlags: 'هل ينتشر الألم إلى الذراع أو الفك أو الظهر، أو يصاحبه تعرق أو ضيق في التنفس أو إغماء؟',
    qCity: 'في أي مدينة أنت (أو تخطط للسفر إليها)؟',
    qCondition: 'ما الحالة أو الإجراء الذي تريد رأيًا ثانيًا بشأنه؟',
    injection:
      'لا أستطيع فعل ذلك. أعرض فقط الأطباء والمستشفيات الموجودين في قاعدة بيانات هيلتريب، ولا أخترع أي مقدمي خدمة أو أسعار أو تقييمات. نغطي حاليًا القاهرة والجيزة والإسكندرية وإسطنبول. أخبرني بالأعراض أو التخصص الذي تحتاجه وسأبحث لك في شبكتنا.',
    injectionReason: 'الطلب حاول تجاوز القواعد واختلاق بيانات، وهذا غير مسموح.',
    noInfo: 'لا تتوفر لدي هذه المعلومة في قاعدة معرفة هيلتريب، ولن أخمّن. يمكنك سؤال المستشفى مباشرة، أو اسألني عن الأطباء والتخصصات وكيفية عمل خدمات هيلتريب.',
    noInfoReason: 'لم يتطابق أي مقال في قاعدة المعرفة مع السؤال بدرجة كافية.',
    kbDown: 'قاعدة المعرفة غير متاحة مؤقتًا، لذا لا أستطيع الإجابة عن هذا الجزء الآن. لا يزال بإمكاني البحث عن الأطباء والمستشفيات.',
    kbDownReason: 'قاعدة المعرفة غير متاحة؛ تمت الإجابة باستخدام قاعدة البيانات فقط.',
    kbReason: 'الإجابة مبنية على دليل المرضى من هيلتريب (انظر المصدر).',
    accordingTo: (title: string) => `وفقًا لدليل هيلتريب «${title}»:`,
    found: (n: number, city?: string) => `وجدت ${n} ${n > 2 ? 'خيارات مناسبة' : 'خيار مناسب'} في شبكتنا${city ? ` في ${CITY_AR[city] ?? city}` : ''}. التفاصيل أدناه مأخوذة مباشرة من قاعدة بياناتنا.`,
    none: 'لم أجد طبيبًا مطابقًا في شبكتنا بهذه الشروط. جرّب توسيع البحث (مدينة أخرى أو ميزانية أعلى) — لن أقترح مقدمي خدمة غير موجودين في قاعدة بياناتنا.',
    reason: (s: NextStep, f: ExtractedFacts) => {
      const parts = [f.symptoms.length ? `الأعراض: ${f.symptoms.join('، ')}` : '', f.durationDays !== undefined ? `منذ نحو ${f.durationDays} يوم` : '', f.severity ? `الشدة ${f.severity}/10` : '', f.wantsSecondOpinion ? 'طلبت رأيًا ثانيًا' : ''].filter(Boolean);
      return `الخطوة المقترحة: ${STEP_LABEL.ar[s]}${parts.length ? ` (${parts.join('، ')})` : ''}. لم تُذكر علامات خطر طارئة.`;
    },
    match: (d: DoctorHit, bio: boolean) =>
      [`${CITY_AR[d.city] ?? d.city}`, `الكشف ${d.consultationFeeUsd} دولار`, `التقييم ${d.rating}`, `يتحدث ${d.languages.map((l) => LANG_AR[l] ?? l).join('/')}`,
        d.offersSecondOpinion ? 'يقدم رأيًا ثانيًا' : '', d.offersTelemedicine ? 'استشارات عن بُعد' : '', bio ? 'خبرة ذات صلة في ملفه (انظر المصدر)' : '']
        .filter(Boolean).join(' · '),
  },
};
