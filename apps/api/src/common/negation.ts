/**
 * Clause-scoped negation detection shared by triage and fact extraction (EN + AR).
 * "no sweating, but pain spreads to my jaw" → "sweating" negated, "jaw" not.
 * Input must already be normalizeText()-ed.
 */
const NEGATION_EN = /\b(?:no|not|without|never|denies|deny|don't have|do not have|doesn't|does not|isn't|no signs? of)\b/;
const NEGATION_AR = /(?:^|\s)(?:لا|مفيش|ما فيش|بدون|من غير|ليس|مش|ما عنديش|ما عندي|لا يوجد|لم)(?:\s|$)/;
const CLAUSE_BREAK = /[.,;!?،؛\n]|\bbut\b|\bhowever\b|لكن|بس /g;

/** True when a negation cue appears earlier in the same clause (looks back ~40 chars). */
export function isNegated(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 40), idx);
  let clauseStart = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) clauseStart = (m.index ?? 0) + m[0].length;
  const clause = before.slice(clauseStart);
  return NEGATION_EN.test(clause) || NEGATION_AR.test(clause);
}
