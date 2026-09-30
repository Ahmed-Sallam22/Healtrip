import { type ExtractedFacts, type FactsPatch, FactsPatchSchema, findCityInText } from '@healtrip/shared';
import { isNegated } from '../common/negation';
import { normalizeText } from '../common/text';

/**
 * Deterministic, rule-based fact extraction (EN + AR). Runs every turn *before* the agent so the
 * model starts from structured memory and asks fewer questions. The model may add facts too
 * (terminal-tool `facts` patch), but those are schema-validated and merged, never trusted blindly.
 */

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, couple: 2,
};
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

const AR_DURATIONS: { re: RegExp; days: (n: number) => number }[] = [
  { re: /(\d+)\s*(?:ايام|يوم)/, days: (n) => n },
  { re: /(\d+)\s*(?:اسابيع|اسبوع)/, days: (n) => n * 7 },
  { re: /(\d+)\s*(?:شهور|اشهر|شهر)/, days: (n) => n * 30 },
  { re: /(\d+)\s*(?:سنوات|سنين|سنه)/, days: (n) => n * 365 },
];
const AR_DUAL: [RegExp, number][] = [
  [/يومين/, 2], [/اسبوعين/, 14], [/شهرين/, 60], [/سنتين/, 730], [/(?:^|\s)(?:امبارح|امس)(?:\s|$)/, 1],
  [/(?:^|\s)اسبوع(?:\s|$)/, 7], [/(?:^|\s)شهر(?:\s|$)/, 30],
];

const LANGUAGE_CUES: { code: string; re: RegExp }[] = [
  { code: 'en', re: /\b(?:speak(?:s)? english|english[- ]speaking|in english)\b|بالانجليزي|الانجليزيه|انجليزي/ },
  { code: 'ar', re: /\b(?:speak(?:s)? arabic|arabic[- ]speaking|in arabic)\b|بالعربي|يتحدث العربيه/ },
  { code: 'tr', re: /\b(?:speak(?:s)? turkish|turkish[- ]speaking|in turkish)\b|بالتركي|التركيه/ },
  { code: 'fr', re: /\b(?:speak(?:s)? french|french[- ]speaking|in french)\b|بالفرنسي|الفرنسيه/ },
];

export function extractFacts(rawText: string, symptomKeywords: string[] = []): FactsPatch {
  const text = normalizeText(rawText);
  const patch: FactsPatch = {};

  const city = findCityInText(text) ?? findCityInText(rawText);
  if (city) {
    patch.city = city.code;
    patch.country = city.country;
  }

  const age =
    text.match(/\b(\d{1,3})\s*(?:years? old|yrs? old|y\/o|yo)\b/)?.[1] ??
    text.match(/\b(?:age|aged|i am|i'm)\s*(\d{1,3})\b(?!\s*(?:days?|weeks?|months?|\$|usd|dollars?|\/10))/)?.[1] ??
    text.match(/(?:عمري|سني|عندي)\s*(\d{1,3})\s*(?:سنه|سنة|عام|عاما)/)?.[1];
  if (age && +age > 0 && +age <= 120) patch.age = +age;

  // Remove age phrases first so "45 years old" is not read as a 45-year symptom duration.
  const withoutAge = text
    .replace(/\b\d{1,3}\s*(?:years? old|yrs? old|y\/o|yo)\b/g, ' ')
    .replace(/(?:عمري|سني|عندي)\s*\d{1,3}\s*(?:سنه|عام|عاما)/g, ' ');
  const duration = parseDurationDays(withoutAge);
  if (duration !== undefined) patch.durationDays = duration;

  const severity = text.match(/\b(\d{1,2})\s*(?:\/|out of|من)\s*10\b/)?.[1];
  if (severity && +severity >= 1 && +severity <= 10) patch.severity = +severity;
  else if (/\b(?:mild|slight|minor)\b|خفيف|بسيط/.test(text)) patch.severity = 3;
  else if (/\bmoderate\b|متوسط/.test(text)) patch.severity = 5;
  else if (/\b(?:severe|unbearable|excruciating|very bad)\b|شديد|جامد|لا يحتمل/.test(text)) patch.severity = 8;

  const budget =
    text.match(/(?:under|below|less than|max(?:imum)?|up to|budget(?: of| is)?(?: under| around| about)?)\s*(?:usd\s*)?\$?\s*(\d{2,6})/)?.[1] ??
    text.match(/\$\s*(\d{2,6})/)?.[1] ??
    text.match(/(\d{2,6})\s*(?:usd|dollars?|دولار)/)?.[1];
  if (budget) patch.budgetUsd = +budget;

  const lang = LANGUAGE_CUES.find((l) => l.re.test(text));
  if (lang) patch.preferredLanguage = lang.code;

  // Intent, not mention: "I want a second opinion" counts; "not sure whether … or a second opinion" does not.
  const SECOND_OPINION = '(?:second|another) (?:medical )?opinion|رايا? (?:طبيا? )?(?:ثانيا?|تاني|اخر)|الراي (?:الطبي )?الثاني';
  const EN_INTENT = '\\b(?:want|need|would like|looking for|get|getting|request|requesting|seeking|interested in)\\b';
  const AR_INTENT = '(?:اريد|عايز|عاوز|محتاج|احتاج|اطلب|ابحث عن|ارغب في)';
  const unsure = /\b(?:not sure|whether|should i)\b|مش عارف|لست متاكد|هل اروح/.test(text);
  if (new RegExp(`(?:${EN_INTENT}|${AR_INTENT})[^.?!]{0,25}(?:${SECOND_OPINION})`).test(text) && !(unsure && !/\balready\b|بالفعل/.test(text))) {
    patch.wantsSecondOpinion = true;
  }
  if (/\b(?:telemedicine|online consultation|video (?:call|consultation)|remote consultation)\b|عن بعد|اونلاين|اون لاين/.test(text)) {
    patch.wantsTelemedicine = true;
  }

  const diagnosis = text.match(/\bdiagnosed with ([a-z][a-z \-']{2,60}?)(?:[.,;]|\band\b|$)/)?.[1];
  if (diagnosis) {
    patch.hasDiagnosis = true;
    patch.diagnosis = diagnosis.trim();
  } else if (/\b(?:i (?:already )?have a diagnosis|was diagnosed|my diagnosis)\b|تم تشخيصي|شخصني|التشخيص|عندي تشخيص/.test(text)) {
    patch.hasDiagnosis = true;
  }
  if (/\b(?:recommended|advised|told me to (?:get|have))\b[^.]{0,30}\b(?:surgery|operation|procedure)\b|نصحني[^.]{0,30}(?:عمليه|جراحه)/.test(text)) {
    patch.hasDiagnosis = true;
  }

  const symptoms = symptomKeywords
    .map((k) => ({ raw: k, norm: normalizeText(k) }))
    .filter(({ norm }) => norm.length >= 3 && containsTerm(text, norm))
    // drop keywords contained in a longer matched keyword ("ركبه" inside "الركبه", "heart" inside "heart failure")
    .filter(({ norm }, _i, all) => !all.some((o) => o.norm !== norm && o.norm.includes(norm)))
    .map(({ raw }) => raw);
  if (symptoms.length) patch.symptoms = dedupe(symptoms).slice(0, 10);

  return patch;
}

/** True if the term is mentioned at least once without being negated ("no shortness of breath"). */
function containsTerm(text: string, term: string): boolean {
  const re = /^[\x20-\x7e]+$/.test(term)
    ? new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
    : new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  for (const m of text.matchAll(re)) if (!isNegated(text, m.index ?? 0)) return true;
  return false;
}

function parseDurationDays(text: string): number | undefined {
  const en = text.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|few|couple)\s*(?:of\s*)?(day|week|month|year)s?\b/);
  if (en) {
    const n = /^\d+$/.test(en[1]) ? +en[1] : WORD_NUMBERS[en[1]];
    return n * UNIT_DAYS[en[2]];
  }
  if (/\b(?:since yesterday|yesterday)\b/.test(text)) return 1;
  if (/\b(?:today|this morning|an hour ago|few hours|hours ago)\b/.test(text)) return 0;
  for (const { re, days } of AR_DURATIONS) {
    const m = text.match(re);
    if (m) return days(+m[1]);
  }
  for (const [re, days] of AR_DUAL) if (re.test(text)) return days;
  return undefined;
}

const dedupe = <T>(xs: T[]) => [...new Set(xs)];

/** Merges a patch into existing facts. Later information wins; symptom lists are unioned. */
export function mergeFacts(base: ExtractedFacts, ...patches: (FactsPatch | undefined)[]): ExtractedFacts {
  const out: ExtractedFacts = { ...base, symptoms: [...base.symptoms] };
  for (const raw of patches) {
    if (!raw) continue;
    const parsed = FactsPatchSchema.safeParse(raw);
    if (!parsed.success) continue; // an invalid model-provided patch is dropped, not trusted
    const { symptoms, ...rest } = parsed.data;
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    if (symptoms?.length) out.symptoms = dedupe([...out.symptoms, ...symptoms]).slice(0, 20);
  }
  return out;
}
