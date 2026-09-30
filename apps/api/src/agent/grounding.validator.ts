import { Injectable } from '@nestjs/common';
import {
  type AskClarifyingQuestionsArgs,
  AskClarifyingQuestionsArgsSchema,
  CITIES,
  type KnowledgeChunk,
  NEXT_STEP_ACUITY,
  type NextStep,
  type SubmitRecommendationArgs,
  SubmitRecommendationArgsSchema,
} from '@healtrip/shared';
import { normalizeText } from '../common/text';
import type { DoctorRecord, HospitalRecord } from '../providers/providers.repository';
import type { EvidencePatch } from '../tools/tool.types';

/**
 * Everything the tools returned during the current turn. This — not the model's text — is the
 * source of truth the final answer is checked against.
 */
export class TurnEvidence {
  readonly doctors = new Map<string, DoctorRecord>();
  readonly hospitals = new Map<string, HospitalRecord>();
  readonly chunks = new Map<string, KnowledgeChunk>();

  absorb(patch?: EvidencePatch): void {
    patch?.doctors?.forEach((d) => this.doctors.set(d.id, d));
    patch?.hospitals?.forEach((h) => this.hospitals.set(h.id, h));
    patch?.chunks?.forEach((c) => this.chunks.set(c.chunkId, c));
  }

  /** Hospital ids seen this turn, either directly or as the hospital of a returned doctor. */
  knownHospitalIds(): Set<string> {
    return new Set([...this.hospitals.keys(), ...[...this.doctors.values()].map((d) => d.hospitalId)]);
  }
}

export interface ValidationContext {
  /** Deterministic triage floor: the answer may never be less urgent than this. */
  floor: NextStep | null;
  /** Amounts the user mentioned themselves (e.g. budget) may be repeated back. */
  userAmounts: number[];
}

export interface ValidationResult<T> {
  ok: boolean;
  errors: string[];
  warnings: string[];
  value?: T;
}

const MONEY = /(?:\$|usd\s?|us\$)\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:usd|us dollars?|dollars?|\$|دولار)/gi;
const RATING = /\brated\s+(\d(?:\.\d)?)|(\d\.\d)\s*(?:\/\s*5|stars?|out of 5|rating|نجوم|تقييم)/gi;
const EN_DOCTOR_NAME = /\b(?:Dr|Doctor)\.?\s+([A-Z][\p{L}'-]+)/gu;
// "د." / "دكتور" / "الدكتور" / "بالدكتور" at a word start, followed by the name token.
const AR_DOCTOR_NAME = /(?<![\u0621-\u064A])(?:د\.\s*|(?:[وبل]?ال|[وبل])?دكتور[ةه]?\s+)([\u0621-\u064A]{2,})/gu;
const AR_NOT_A_NAME = new Set(['المعالج', 'المختص', 'المناسب', 'الخاص', 'المتابع', 'متخصص', 'مختص']);

/**
 * GroundingValidator — the last line of defence against hallucinated providers or facts.
 *
 * Checks a terminal tool call against this turn's TurnEvidence:
 *  1. schema (constrained nextStep enum, disclaimerShown, sizes)
 *  2. every providerId was returned by a tool this turn
 *  3. every citation chunkId was returned by search_knowledge_base this turn, and doctor_bio
 *     chunks are only used alongside that doctor's DB record (included in providers)
 *  4. claims in free text (prices, ratings, doctor names, cities) match DB values from evidence
 *  5. SECOND_OPINION only with doctors that actually offer second opinions
 *  6. triage floor: the model may escalate but never de-escalate (auto-upgraded, logged)
 * Errors trigger one repair retry; warnings are informational.
 */
@Injectable()
export class GroundingValidator {
  validateRecommendation(raw: unknown, ev: TurnEvidence, ctx: ValidationContext): ValidationResult<SubmitRecommendationArgs> {
    const parsed = SubmitRecommendationArgsSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, warnings: [], errors: parsed.error.issues.map((i) => `schema: ${i.path.join('.') || '(root)'}: ${i.message}`) };
    }
    const value: SubmitRecommendationArgs = { ...parsed.data };
    const errors: string[] = [];
    const warnings: string[] = [];
    const knownHospitals = ev.knownHospitalIds();

    // (2) provider ids
    const seen = new Set<string>();
    value.providers = value.providers.filter((p) => {
      if (seen.has(p.providerId)) {
        warnings.push(`duplicate provider ${p.providerId} removed`);
        return false;
      }
      seen.add(p.providerId);
      return true;
    });
    for (const p of value.providers) {
      const doctor = ev.doctors.get(p.providerId);
      const isHospital = knownHospitals.has(p.providerId);
      if (!doctor && !isHospital) {
        errors.push(`providerId "${p.providerId}" was not returned by any tool in this turn — remove it or search for it`);
        continue;
      }
      // (4) claims inside matchReason must match this provider's own DB values
      const reasonCheck = checkText(p.matchReason, ev, ctx, doctor ? [doctor] : undefined);
      errors.push(...reasonCheck.map((e) => `providers[${p.providerId}].matchReason: ${e}`));
      if (doctor) {
        const mentionedCities = citiesIn(p.matchReason);
        const wrong = mentionedCities.filter((c) => c !== doctor.city);
        if (wrong.length) errors.push(`providers[${p.providerId}].matchReason mentions ${wrong.join(', ')} but the doctor is in ${doctor.city}`);
      }
      // (5)
      if (value.nextStep === 'SECOND_OPINION' && doctor && !doctor.offersSecondOpinion) {
        errors.push(`nextStep is SECOND_OPINION but ${p.providerId} does not offer second opinions (offersSecondOpinion=false)`);
      }
    }

    // (3) citations
    value.citations = [...new Set(value.citations)];
    for (const chunkId of value.citations) {
      const chunk = ev.chunks.get(chunkId);
      if (!chunk) {
        errors.push(`citation "${chunkId}" was not returned by search_knowledge_base in this turn`);
        continue;
      }
      if (chunk.sourceType === 'doctor_bio' && chunk.sourceId) {
        if (!ev.doctors.has(chunk.sourceId)) {
          errors.push(`citation "${chunkId}" is about doctor ${chunk.sourceId}, whose DB record was not fetched this turn — call search_providers first`);
        } else if (!seen.has(chunk.sourceId)) {
          errors.push(`citation "${chunkId}" is about doctor ${chunk.sourceId}; include that doctor in providers or drop the citation`);
        }
      }
      // Hospital profiles are descriptive (services, departments) and their sourceId is validated at
      // ingestion, so they may be cited on their own; structured hospital facts still come from SQL.
      if (chunk.sourceType === 'hospital_profile' && chunk.sourceId && !knownHospitals.has(chunk.sourceId)) {
        warnings.push(`citation "${chunkId}" (hospital ${chunk.sourceId}) used without a hospital record this turn`);
      }
    }

    // (4) free-text claims in the user-facing message and reasoning
    errors.push(...checkText(`${value.message}\n${value.reasoning}`, ev, ctx).map((e) => `message: ${e}`));

    // (6) triage floor — deterministic override, never downward
    if (ctx.floor && NEXT_STEP_ACUITY[value.nextStep] < NEXT_STEP_ACUITY[ctx.floor]) {
      warnings.push(`nextStep ${value.nextStep} upgraded to ${ctx.floor} by triage floor`);
      value.nextStep = ctx.floor;
      if (ctx.floor === 'EMERGENCY_NOW') value.urgency = 'critical';
      else if (value.urgency === 'low' || value.urgency === 'medium') value.urgency = 'high';
    }

    return { ok: errors.length === 0, errors, warnings, value: errors.length ? undefined : value };
  }

  validateClarification(raw: unknown, ev: TurnEvidence, ctx: ValidationContext): ValidationResult<AskClarifyingQuestionsArgs> {
    const parsed = AskClarifyingQuestionsArgsSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, warnings: [], errors: parsed.error.issues.map((i) => `schema: ${i.path.join('.') || '(root)'}: ${i.message}`) };
    }
    const text = [parsed.data.message ?? '', ...parsed.data.questions].join('\n');
    const errors = checkText(text, ev, ctx).map((e) => `clarification: ${e}`);
    return { ok: !errors.length, errors, warnings: [], value: errors.length ? undefined : parsed.data };
  }
}

/** Checks prices, ratings and doctor names in free text against evidence. Returns error strings. */
function checkText(text: string, ev: TurnEvidence, ctx: ValidationContext, scope?: DoctorRecord[]): string[] {
  const errors: string[] = [];
  const doctors = scope ?? [...ev.doctors.values()];
  const fees = new Set([...doctors.map((d) => d.consultationFeeUsd), ...ctx.userAmounts]);
  for (const m of text.matchAll(MONEY)) {
    const amount = Number((m[1] ?? m[2]).replace(',', '.'));
    if (!fees.has(amount)) errors.push(`mentions price $${amount}, which does not match any fee returned by tools`);
  }
  const ratings = new Set(doctors.map((d) => d.rating));
  for (const m of text.matchAll(RATING)) {
    const rating = Number(m[1] ?? m[2]);
    if (!ratings.has(rating)) errors.push(`mentions rating ${rating}, which does not match any rating returned by tools`);
  }
  const allDoctors = [...ev.doctors.values()];
  const enNames = allDoctors.map((d) => d.nameEn.toLowerCase());
  for (const m of text.matchAll(EN_DOCTOR_NAME)) {
    const token = m[1].toLowerCase();
    if (!enNames.some((n) => n.split(/\s+/).includes(token))) errors.push(`mentions "Dr. ${m[1]}", who was not returned by any tool this turn`);
  }
  const arNames = allDoctors.map((d) => normalizeText(d.nameAr));
  for (const m of text.matchAll(AR_DOCTOR_NAME)) {
    if (AR_NOT_A_NAME.has(m[1])) continue;
    const token = normalizeText(m[1]);
    if (!arNames.some((n) => n.split(/\s+/).includes(token))) errors.push(`mentions "د. ${m[1]}", who was not returned by any tool this turn`);
  }
  return errors;
}

function citiesIn(text: string): string[] {
  const t = normalizeText(text);
  return CITIES.filter((c) => [c.nameEn, c.nameAr, ...c.aliases].some((a) => a.length > 3 && t.includes(normalizeText(a)))).map((c) => c.code);
}
