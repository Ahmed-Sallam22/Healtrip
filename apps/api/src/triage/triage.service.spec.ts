import { TriageService } from './triage.service';

describe('TriageService (deterministic red flags)', () => {
  const triage = new TriageService();
  const run = (text: string, facts = {}) => triage.evaluate([text], facts);

  it.each([
    'I have chest pain spreading to my left arm and I am sweating',
    'Chest pain and I feel short of breath',
    'crushing chest pressure, I nearly fainted',
    'عندي ألم في الصدر وبيمتد للذراع الشمال وعرقان',
    'ألم في صدري مع ضيق في التنفس',
  ])('escalates chest pain + red flag to EMERGENCY_NOW: %s', (text) => {
    const r = run(text);
    expect(r.level).toBe('EMERGENCY');
    expect(r.floor).toBe('EMERGENCY_NOW');
    expect(r.matches.map((m) => m.ruleId)).toContain('cardiac_chest_pain_with_red_flag');
  });

  it('does not escalate mild chest pain without red flags', () => {
    const r = run('Mild chest pain for 2 weeks, no sweating or shortness of breath, it does not spread anywhere');
    expect(r.level).toBe('NONE');
    expect(r.floor).toBeNull();
  });

  it('respects Arabic negation', () => {
    expect(run('ألم خفيف في الصدر من أسبوعين بدون ضيق في التنفس').level).toBe('NONE');
  });

  it('negation only applies within its clause', () => {
    const r = run('chest pain, no sweating, but it is spreading to my jaw');
    expect(r.level).toBe('EMERGENCY');
  });

  it.each([
    ['stroke', 'my father has slurred speech and his face is drooping'],
    ['bleeding', 'I cut my hand and it is bleeding heavily'],
    ['suicidal', 'I want to end my life'],
    ['suicidal-ar', 'أفكر في الانتحار'],
    ['airway', 'my son is choking'],
  ])('escalates %s', (_name, text) => {
    expect(run(text).level).toBe('EMERGENCY');
  });

  it('uses structured facts: chest pain rated >= 8/10 is an emergency', () => {
    const r = triage.evaluate(['it hurts'], { symptoms: ['chest pain'], severity: 9 });
    expect(r.matches.map((m) => m.ruleId)).toContain('severe_chest_pain_score');
    expect(r.floor).toBe('EMERGENCY_NOW');
  });

  it('sets an URGENT floor (not emergency) for fever with stiff neck', () => {
    const r = run('high fever and a stiff neck since this morning');
    expect(r.level).toBe('URGENT');
    expect(r.floor).toBe('URGENT_CARE_24H');
  });

  it('considers earlier messages in the conversation (mid-conversation escalation)', () => {
    const r = triage.evaluate(['I have some chest pain', 'now the pain is going to my left arm']);
    expect(r.level).toBe('EMERGENCY');
  });

  it('does not match unrelated text', () => {
    expect(run('I need a dermatologist for acne in Alexandria').level).toBe('NONE');
  });
});
