import { InMemoryProvidersRepository } from '../../test/support/in-memory.repository';
import { GroundingValidator, TurnEvidence } from './grounding.validator';

const repo = new InMemoryProvidersRepository();
const doctor = (id: string) => repo.doctors.find((d) => d.id === id)!;
const validator = new GroundingValidator();
const noFloor = { floor: null, userAmounts: [] };

function evidence() {
  const ev = new TurnEvidence();
  ev.absorb({
    doctors: [doctor('doc-cai-card-01'), doctor('doc-cai-card-03')],
    chunks: [
      { chunkId: 'doctor_bio:doc-cai-card-01:en#0', sourceType: 'doctor_bio', sourceId: 'doc-cai-card-01', title: 'Karim', text: '...', score: 0.5 },
      { chunkId: 'doctor_bio:doc-ist-card-01:en#0', sourceType: 'doctor_bio', sourceId: 'doc-ist-card-01', title: 'Emre', text: '...', score: 0.5 },
      { chunkId: 'patient_guide:second-opinion:en#0', sourceType: 'patient_guide', sourceId: null, title: 'Guide', text: '...', score: 0.5 },
    ],
  });
  return ev;
}

const base = {
  nextStep: 'BOOK_SPECIALIST',
  urgency: 'low',
  message: 'Here are cardiologists from our network.',
  reasoning: 'Mild, long-standing symptoms without red flags.',
  providers: [{ providerId: 'doc-cai-card-01', matchReason: 'Cardiology in Cairo · $60 consultation' }],
  citations: [],
  disclaimerShown: true,
};

describe('GroundingValidator', () => {
  it('accepts an answer grounded in this turn\'s tool results', () => {
    const r = validator.validateRecommendation(base, evidence(), noFloor);
    expect(r.ok).toBe(true);
    expect(r.value?.providers).toHaveLength(1);
  });

  it('REJECTS a provider id that no tool returned (hallucinated doctor)', () => {
    const r = validator.validateRecommendation(
      { ...base, providers: [{ providerId: 'doc-par-card-99', matchReason: 'Top cardiologist in Paris' }] },
      evidence(),
      noFloor,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/doc-par-card-99.*not returned/);
  });

  it('rejects a REAL doctor id that exists in the DB but was not returned this turn', () => {
    expect(validator.validateRecommendation({ ...base, providers: [{ providerId: 'doc-ist-card-01', matchReason: 'x' }] }, evidence(), noFloor).ok).toBe(false);
  });

  it('rejects invented prices and ratings in free text, accepts exact DB values and the user\'s own budget', () => {
    expect(validator.validateRecommendation({ ...base, message: 'Dr. Karim costs only $25.' }, evidence(), noFloor).errors.join()).toMatch(/\$25/);
    expect(validator.validateRecommendation({ ...base, message: 'Rated 5.0 stars!' }, evidence(), noFloor).errors.join()).toMatch(/rating 5/);
    expect(validator.validateRecommendation({ ...base, message: 'Dr. Karim (rated 4.8) charges $60.' }, evidence(), noFloor).ok).toBe(true);
    expect(validator.validateRecommendation({ ...base, message: 'All options are under your $80 budget.' }, evidence(), { floor: null, userAmounts: [80] }).ok).toBe(true);
  });

  it('rejects doctor names that did not come from tools (EN and AR)', () => {
    expect(validator.validateRecommendation({ ...base, message: 'I recommend Dr. House.' }, evidence(), noFloor).ok).toBe(false);
    expect(validator.validateRecommendation({ ...base, message: 'أنصحك بالدكتور مجدي يعقوب' }, evidence(), noFloor).ok).toBe(false);
    expect(validator.validateRecommendation({ ...base, message: 'أنصحك بالدكتور كريم فوزي' }, evidence(), noFloor).ok).toBe(true);
    // words ending in "د." and generic phrases are not doctor names
    expect(validator.validateRecommendation({ ...base, message: 'راجع الطبيب بعد. سيحدد الدكتور المعالج الخطة.' }, evidence(), noFloor).ok).toBe(true);
  });

  it('rejects a matchReason whose city contradicts the DB record', () => {
    const r = validator.validateRecommendation({ ...base, providers: [{ providerId: 'doc-cai-card-01', matchReason: 'Cardiologist in Istanbul' }] }, evidence(), noFloor);
    expect(r.errors.join()).toMatch(/mentions Istanbul but the doctor is in Cairo/);
  });

  it('rejects citations that were not retrieved this turn', () => {
    expect(validator.validateRecommendation({ ...base, citations: ['patient_guide:made-up:en#0'] }, evidence(), noFloor).ok).toBe(false);
  });

  it('only allows a doctor_bio citation together with that doctor\'s DB record in providers', () => {
    expect(validator.validateRecommendation({ ...base, citations: ['doctor_bio:doc-cai-card-01:en#0'] }, evidence(), noFloor).ok).toBe(true);
    // bio retrieved, but the doctor's SQL record was not fetched this turn
    expect(validator.validateRecommendation({ ...base, citations: ['doctor_bio:doc-ist-card-01:en#0'] }, evidence(), noFloor).errors.join()).toMatch(/DB record was not fetched/);
    // doctor fetched but not recommended
    expect(validator.validateRecommendation({ ...base, providers: [{ providerId: 'doc-cai-card-03', matchReason: 'x' }], citations: ['doctor_bio:doc-cai-card-01:en#0'] }, evidence(), noFloor).errors.join()).toMatch(/include that doctor/);
  });

  it('SECOND_OPINION requires doctors that actually offer second opinions (DB value)', () => {
    const r = validator.validateRecommendation({ ...base, nextStep: 'SECOND_OPINION', providers: [{ providerId: 'doc-cai-card-03', matchReason: 'x' }] }, evidence(), noFloor);
    expect(r.errors.join()).toMatch(/does not offer second opinions/);
  });

  it('enforces the triage floor by upgrading, never downgrading', () => {
    const r = validator.validateRecommendation({ ...base, nextStep: 'SELF_CARE_MONITOR' }, evidence(), { floor: 'URGENT_CARE_24H', userAmounts: [] });
    expect(r.ok).toBe(true);
    expect(r.value?.nextStep).toBe('URGENT_CARE_24H');
    expect(r.value?.urgency).toBe('high');
    expect(r.warnings.join()).toMatch(/upgraded/);
  });

  it('rejects out-of-enum next steps and a missing disclaimer', () => {
    expect(validator.validateRecommendation({ ...base, nextStep: 'SEE_A_SHAMAN' }, evidence(), noFloor).ok).toBe(false);
    expect(validator.validateRecommendation({ ...base, disclaimerShown: false }, evidence(), noFloor).ok).toBe(false);
  });

  it('checks clarifying questions for invented claims too', () => {
    const ev = new TurnEvidence();
    expect(validator.validateClarification({ questions: ['Would Dr. Smith at $10 work for you?'], missingFacts: ['city'] }, ev, noFloor).ok).toBe(false);
    expect(validator.validateClarification({ questions: ['Which city are you in?'], missingFacts: ['city'] }, ev, noFloor).ok).toBe(true);
  });
});
