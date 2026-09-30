import { Injectable } from '@nestjs/common';
import type { ExtractedFacts, NextStep } from '@healtrip/shared';
import { normalizeText } from '../common/text';
import {
  CHEST_PAIN,
  CHEST_PAIN_EMERGENCY_SEVERITY,
  type Concept,
  LEVEL_TO_FLOOR,
  RED_FLAG_RULES,
  type RedFlagRule,
  TRIAGE_RULES_VERSION,
  type TriageLevel,
} from './triage.rules';

export interface TriageMatch {
  ruleId: string;
  level: TriageLevel;
  label: string;
  evidence: string[];
}

export interface TriageResult {
  level: TriageLevel | 'NONE';
  /** Minimum next step the agent is allowed to recommend (null = no constraint). */
  floor: NextStep | null;
  matches: TriageMatch[];
  rulesVersion: string;
}

interface CompiledConcept {
  id: string;
  phrases: { text: string; ascii: boolean }[];
  patterns: RegExp[];
}

// Negation cues that apply to the *next* symptom mention inside the same clause.
const NEGATION_EN = /\b(?:no|not|without|never|denies|deny|don't have|do not have|doesn't|does not|isn't|no signs? of)\b/;
const NEGATION_AR = /(?:^|\s)(?:لا|مفيش|ما فيش|بدون|من غير|ليس|مش|ما عنديش|ما عندي|لا يوجد|لم)(?:\s|$)/;
const CLAUSE_BREAK = /[.,;!?،؛\n]|\bbut\b|\bhowever\b|لكن|بس /g;

/**
 * Runs red-flag rules over the user's recent messages + structured facts.
 * Pure and synchronous: no network, no LLM, so the emergency path can never be slowed down or
 * talked out of escalating.
 */
@Injectable()
export class TriageService {
  private readonly rules = RED_FLAG_RULES.map((r) => ({ rule: r, concepts: r.allOf.map(compile) }));
  private readonly chestPain = compile(CHEST_PAIN);

  evaluate(texts: string[], facts?: Partial<ExtractedFacts>): TriageResult {
    const text = normalizeText(texts.join(' . '));
    const matches: TriageMatch[] = [];

    for (const { rule, concepts } of this.rules) {
      const evidence: string[] = [];
      const allPresent = concepts.every((c) => {
        const hit = findConcept(text, c);
        if (hit) evidence.push(hit);
        return Boolean(hit);
      });
      if (allPresent) matches.push(toMatch(rule, evidence));
    }

    // Structured-fact rule: very severe chest pain is an emergency even without other signs.
    const hasChestPain =
      Boolean(findConcept(text, this.chestPain)) ||
      (facts?.symptoms ?? []).some((s) => Boolean(findConcept(normalizeText(s), this.chestPain)));
    if (hasChestPain && (facts?.severity ?? 0) >= CHEST_PAIN_EMERGENCY_SEVERITY) {
      matches.push({
        ruleId: 'severe_chest_pain_score',
        level: 'EMERGENCY',
        label: `Chest pain rated ${facts?.severity}/10`,
        evidence: [`severity=${facts?.severity}`],
      });
    }

    const level: TriageResult['level'] = matches.some((m) => m.level === 'EMERGENCY')
      ? 'EMERGENCY'
      : matches.length
        ? 'URGENT'
        : 'NONE';
    return {
      level,
      floor: level === 'NONE' ? null : LEVEL_TO_FLOOR[level],
      matches,
      rulesVersion: TRIAGE_RULES_VERSION,
    };
  }
}

function toMatch(rule: RedFlagRule, evidence: string[]): TriageMatch {
  return { ruleId: rule.id, level: rule.level, label: rule.labelEn, evidence };
}

function compile(concept: Concept): CompiledConcept {
  return {
    id: concept.id,
    phrases: (concept.phrases ?? []).map((p) => {
      const text = normalizeText(p);
      return { text, ascii: /^[\x20-\x7e]+$/.test(text) };
    }),
    patterns: concept.patterns ?? [],
  };
}

/** Returns the matched snippet for the first non-negated mention of the concept, or null. */
export function findConcept(text: string, concept: CompiledConcept): string | null {
  for (const { text: phrase, ascii } of concept.phrases) {
    let from = 0;
    while (from <= text.length) {
      const idx = text.indexOf(phrase, from);
      if (idx < 0) break;
      from = idx + 1;
      // English phrases need word boundaries; Arabic allows attached prefixes (و، ب، ال...).
      if (ascii && !isWordBounded(text, idx, phrase.length)) continue;
      if (!isNegated(text, idx)) return phrase;
    }
  }
  for (const pattern of concept.patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const m of text.matchAll(re)) {
      if (!isNegated(text, m.index ?? 0)) return m[0];
    }
  }
  return null;
}

function isWordBounded(text: string, idx: number, len: number): boolean {
  const before = idx === 0 ? ' ' : text[idx - 1];
  const after = idx + len >= text.length ? ' ' : text[idx + len];
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

/** Looks back within the current clause (max ~40 chars) for a negation cue. */
function isNegated(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 40), idx);
  let clauseStart = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) clauseStart = (m.index ?? 0) + m[0].length;
  const clause = before.slice(clauseStart);
  return NEGATION_EN.test(clause) || NEGATION_AR.test(clause);
}
