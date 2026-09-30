import { emptyFacts } from '@healtrip/shared';
import { extractFacts, mergeFacts } from './facts.extractor';

const KEYWORDS = ['chest pain', 'knee', 'ركبة', 'ألم في الصدر', 'headache'];

describe('extractFacts', () => {
  it('extracts English facts', () => {
    const f = extractFacts('I am 52 years old, mild chest pain for 2 weeks, 3/10, I live in Cairo. Budget under $50, English-speaking doctor please', KEYWORDS);
    expect(f).toMatchObject({ age: 52, durationDays: 14, severity: 3, city: 'Cairo', country: 'EG', budgetUsd: 50, preferredLanguage: 'en', symptoms: ['chest pain'] });
  });

  it('extracts Arabic facts', () => {
    const f = extractFacts('نصحني طبيب بعملية في الركبة وأريد رأيًا طبيًا ثانيًا. أنا في الجيزة', KEYWORDS);
    expect(f).toMatchObject({ city: 'Giza', wantsSecondOpinion: true, hasDiagnosis: true, symptoms: ['ركبة'] });
  });

  it('does not confuse age with duration', () => {
    expect(extractFacts('I am 45 years old').durationDays).toBeUndefined();
  });

  it('reads Arabic dual durations', () => {
    expect(extractFacts('صداع من أسبوعين').durationDays).toBe(14);
  });

  it('treats a second opinion mentioned as an option (while unsure) as NOT a request', () => {
    const f = extractFacts("I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.", KEYWORDS);
    expect(f.wantsSecondOpinion).toBeUndefined();
    expect(extractFacts('I already have a diagnosis and want a second opinion').wantsSecondOpinion).toBe(true);
  });

  it('ignores negated symptoms', () => {
    const f = extractFacts('chest pain for 2 weeks, no shortness of breath', [...KEYWORDS, 'shortness of breath']);
    expect(f.symptoms).toEqual(['chest pain']);
  });

  it('detects Istanbul + budget', () => {
    expect(extractFacts("I'm travelling to Istanbul, my budget is under $80")).toMatchObject({ city: 'Istanbul', country: 'TR', budgetUsd: 80 });
  });
});

describe('mergeFacts', () => {
  it('unions symptoms and drops invalid model patches', () => {
    const merged = mergeFacts(
      { ...emptyFacts(), symptoms: ['knee'] },
      { symptoms: ['knee', 'swelling'], city: 'Giza' },
      { severity: 99 } as never, // invalid → ignored entirely
    );
    expect(merged.symptoms).toEqual(['knee', 'swelling']);
    expect(merged.city).toBe('Giza');
    expect(merged.severity).toBeUndefined();
  });
});
