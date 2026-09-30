import { z } from 'zod';
import { LocaleSchema, NextStepSchema, SourceTypeSchema, UrgencySchema } from './enums';
import { ExtractedFactsSchema } from './facts';

export const MAX_MESSAGE_CHARS = 2000;

export const ChatRequestSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
    locale: LocaleSchema,
  })
  .strict();
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const DoctorCardSchema = z.object({
  kind: z.literal('doctor'),
  id: z.string(),
  name: z.string(),
  specialty: z.object({ code: z.string(), name: z.string() }),
  hospital: z.object({ id: z.string(), name: z.string(), city: z.string(), country: z.string() }),
  yearsExperience: z.number(),
  languages: z.array(z.string()),
  consultationFeeUsd: z.number(),
  rating: z.number(),
  offersSecondOpinion: z.boolean(),
  offersTelemedicine: z.boolean(),
  nextAvailableSlot: z.string().nullable(),
  matchReason: z.string(),
});

export const HospitalCardSchema = z.object({
  kind: z.literal('hospital'),
  id: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  hasEmergency: z.boolean(),
  is24h: z.boolean(),
  accreditation: z.string().nullable(),
  phone: z.string(),
  matchReason: z.string(),
});

/** Provider cards are built server-side from DB rows fetched by id — never from model text. */
export const ProviderCardSchema = z.discriminatedUnion('kind', [DoctorCardSchema, HospitalCardSchema]);
export type ProviderCard = z.infer<typeof ProviderCardSchema>;
export type DoctorCard = z.infer<typeof DoctorCardSchema>;
export type HospitalCard = z.infer<typeof HospitalCardSchema>;

export const CitationSchema = z.object({
  chunkId: z.string(),
  sourceType: SourceTypeSchema,
  sourceId: z.string().nullable(),
  title: z.string(),
  snippet: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const TraceEntrySchema = z.object({
  step: z.number(),
  type: z.enum(['guardrail', 'triage', 'llm', 'tool', 'validation', 'repair', 'fallback', 'info']),
  name: z.string(),
  ok: z.boolean(),
  durationMs: z.number(),
  args: z.unknown().optional(),
  summary: z.unknown().optional(),
  error: z.string().optional(),
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

export const EmergencyInfoSchema = z.object({
  numbers: z.array(z.object({ label: z.string(), number: z.string() })),
  matchedRules: z.array(z.string()),
});

export const ChatResponseSchema = z.object({
  sessionId: z.string(),
  messageId: z.string(),
  reply: z.string(),
  reasoning: z.string().nullable(),
  disclaimer: z.string(),
  nextStep: NextStepSchema.nullable(),
  urgency: UrgencySchema.nullable(),
  providers: z.array(ProviderCardSchema),
  clarifyingQuestions: z.array(z.string()),
  citations: z.array(CitationSchema),
  emergency: EmergencyInfoSchema.nullable(),
  /** Which layer produced the answer: deterministic triage, the agent, or the safe fallback. */
  source: z.enum(['triage', 'agent', 'fallback']),
  promptVersion: z.string(),
  trace: z.array(TraceEntrySchema),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string(),
  payload: ChatResponseSchema.nullable(),
});

export const SessionResponseSchema = z.object({
  id: z.string(),
  locale: LocaleSchema,
  status: z.string(),
  createdAt: z.string(),
  extractedFacts: ExtractedFactsSchema,
  messages: z.array(SessionMessageSchema),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** Server-sent events emitted by POST /api/chat/stream. */
export type ChatStreamEvent =
  | { type: 'trace'; entry: TraceEntry }
  | { type: 'final'; response: ChatResponse }
  | { type: 'error'; error: ApiErrorBody };

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'NOT_FOUND',
  'LLM_UNAVAILABLE',
  'DB_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Consistent, bilingual error envelope returned by the global exception filter. */
export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  messageAr: string;
  requestId: string;
  details?: unknown;
}
