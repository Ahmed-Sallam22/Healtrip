import { z } from 'zod';
import { LocaleSchema, NextStepSchema, SourceTypeSchema, UrgencySchema } from './enums';
import { FactsPatchSchema } from './facts';

/**
 * Tool argument schemas. The model's tool-call arguments are parsed with these before any
 * handler runs; the JSON Schema sent to the LLM is generated from the same definitions.
 * Limits are validated loosely here and clamped hard inside the handlers.
 */

const shortText = (max: number) => z.string().trim().min(1).max(max);
const idSchema = z.string().regex(/^[a-z0-9-]{3,64}$/, 'invalid id format');

export const MapSymptomsArgsSchema = z
  .object({
    symptoms: z.array(shortText(80)).min(1).max(10).describe('Symptom keywords in English or Arabic, e.g. ["chest pain"]'),
  })
  .strict();

export const SearchProvidersArgsSchema = z
  .object({
    specialtyCode: z.string().regex(/^[A-Z_]{2,40}$/).describe('Specialty code from map_symptoms_to_specialty, e.g. CARDIOLOGY'),
    city: shortText(60).optional().describe('City name, e.g. Cairo, Giza, Alexandria, Istanbul'),
    country: z.string().length(2).optional().describe('ISO country code: EG or TR'),
    maxFeeUsd: z.number().positive().max(100000).optional().describe('Maximum consultation fee in USD'),
    language: z.string().length(2).optional().describe('ISO 639-1 language the doctor must speak, e.g. ar, en, tr'),
    needsEmergency: z.boolean().optional().describe('Only hospitals with an emergency department'),
    secondOpinion: z.boolean().optional().describe('Only doctors offering second opinions'),
    telemedicine: z.boolean().optional().describe('Only doctors offering telemedicine'),
    limit: z.number().int().positive().max(50).optional().describe('Max results (clamped to 5)'),
  })
  .strict();

export const FindEmergencyHospitalsArgsSchema = z
  .object({ city: shortText(60).optional().describe('City to search; omit to list all ER hospitals in scope') })
  .strict();

export const GetDoctorAvailabilityArgsSchema = z
  .object({
    doctorId: idSchema,
    fromDate: z.string().date().optional().describe('YYYY-MM-DD, defaults to today'),
    days: z.number().int().positive().max(60).optional().describe('Window in days (clamped to 14)'),
  })
  .strict();

export const SearchKnowledgeBaseArgsSchema = z
  .object({
    query: z.string().trim().min(3).max(500),
    locale: LocaleSchema,
    sourceTypes: z.array(SourceTypeSchema).max(3).optional(),
    topK: z.number().int().positive().max(20).optional().describe('Max chunks (clamped to 5)'),
  })
  .strict();

export const RecommendedProviderSchema = z
  .object({
    providerId: idSchema.describe('A doctor or hospital id returned by a tool in THIS turn'),
    matchReason: shortText(300).describe('Why this provider matches, using only tool-returned facts'),
  })
  .strict();

export const SubmitRecommendationArgsSchema = z
  .object({
    nextStep: NextStepSchema,
    urgency: UrgencySchema,
    message: shortText(1500).describe("User-facing reply in the user's locale. No provider facts that were not returned by tools."),
    reasoning: shortText(600).describe('Short rationale for the next step (shown to the user as "why")'),
    providers: z.array(RecommendedProviderSchema).max(5).default([]),
    citations: z.array(z.string().max(80)).max(8).default([]).describe('chunkIds from search_knowledge_base used in the message'),
    followUpQuestions: z.array(shortText(200)).max(2).optional(),
    facts: FactsPatchSchema.optional().describe('Facts learned this turn (symptoms, city, budget...)'),
    disclaimerShown: z.literal(true),
  })
  .strict();

export const AskClarifyingQuestionsArgsSchema = z
  .object({
    questions: z.array(shortText(200)).min(1).max(2),
    missingFacts: z.array(shortText(40)).min(1).max(6),
    message: shortText(600).optional().describe('Optional short lead-in before the questions'),
    facts: FactsPatchSchema.optional(),
  })
  .strict();

export type MapSymptomsArgs = z.infer<typeof MapSymptomsArgsSchema>;
export type SearchProvidersArgs = z.infer<typeof SearchProvidersArgsSchema>;
export type FindEmergencyHospitalsArgs = z.infer<typeof FindEmergencyHospitalsArgsSchema>;
export type GetDoctorAvailabilityArgs = z.infer<typeof GetDoctorAvailabilityArgsSchema>;
export type SearchKnowledgeBaseArgs = z.infer<typeof SearchKnowledgeBaseArgsSchema>;
export type SubmitRecommendationArgs = z.infer<typeof SubmitRecommendationArgsSchema>;
export type AskClarifyingQuestionsArgs = z.infer<typeof AskClarifyingQuestionsArgsSchema>;

export const TOOL_NAMES = {
  mapSymptoms: 'map_symptoms_to_specialty',
  searchProviders: 'search_providers',
  findEmergencyHospitals: 'find_emergency_hospitals',
  getDoctorAvailability: 'get_doctor_availability',
  searchKnowledgeBase: 'search_knowledge_base',
  submitRecommendation: 'submit_recommendation',
  askClarifyingQuestions: 'ask_clarifying_questions',
} as const;
export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
export const TERMINAL_TOOLS: ToolName[] = [TOOL_NAMES.submitRecommendation, TOOL_NAMES.askClarifyingQuestions];

// ---------- Tool results (compact JSON: ids + fields the model needs) ----------

export const TOOL_ERROR_CODES = [
  'INVALID_ARGS',
  'NOT_FOUND',
  'RAG_UNAVAILABLE',
  'NO_RELEVANT_CONTEXT',
  'INTERNAL_ERROR',
  'UNKNOWN_TOOL',
] as const;
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

/** Handlers never throw: failures come back as data so the model can recover. */
export interface ToolError {
  ok: false;
  error: { code: ToolErrorCode; message: string; details?: unknown };
}
export interface ToolSuccess<T> {
  ok: true;
  data: T;
}
export type ToolResult<T> = ToolSuccess<T> | ToolError;

export interface DoctorHit {
  id: string;
  kind: 'doctor';
  name: string;
  specialtyCode: string;
  hospitalId: string;
  hospitalName: string;
  city: string;
  country: string;
  yearsExperience: number;
  languages: string[];
  consultationFeeUsd: number;
  rating: number;
  offersSecondOpinion: boolean;
  offersTelemedicine: boolean;
  hospitalHasEmergency: boolean;
  nextAvailableSlot: string | null;
}

export interface HospitalHit {
  id: string;
  kind: 'hospital';
  name: string;
  city: string;
  country: string;
  hasEmergency: boolean;
  is24h: boolean;
  accreditation: string | null;
  phone: string;
}

export interface SpecialtyMatch {
  specialtyCode: string;
  nameEn: string;
  nameAr: string;
  urgencyHint: string;
  matchedKeywords: string[];
}

export interface SlotHit {
  slotId: string;
  startsAt: string;
  endsAt: string;
}

export interface KnowledgeChunk {
  chunkId: string;
  sourceType: z.infer<typeof SourceTypeSchema>;
  sourceId: string | null;
  title: string;
  text: string;
  score: number;
}
