import { z } from 'zod';

/**
 * Structured session memory. Updated every turn (deterministic extractor + optional
 * model-provided patch), persisted as JSONB on ChatSession so state is inspectable.
 */
export const ExtractedFactsSchema = z.object({
  symptoms: z.array(z.string().max(80)).max(20).default([]),
  durationDays: z.number().nonnegative().max(36500).optional(),
  severity: z.number().int().min(1).max(10).optional(),
  age: z.number().int().min(0).max(120).optional(),
  city: z.string().max(60).optional(),
  country: z.string().length(2).optional(),
  budgetUsd: z.number().positive().max(100000).optional(),
  preferredLanguage: z.string().min(2).max(2).optional(),
  hasDiagnosis: z.boolean().optional(),
  diagnosis: z.string().max(120).optional(),
  wantsSecondOpinion: z.boolean().optional(),
  wantsTelemedicine: z.boolean().optional(),
  insurance: z.string().max(60).optional(),
  clarificationRounds: z.number().int().min(0).default(0),
});
export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;

/** A patch the model may send alongside a terminal tool. Everything optional, same bounds. */
export const FactsPatchSchema = ExtractedFactsSchema.omit({ clarificationRounds: true }).partial();
export type FactsPatch = z.infer<typeof FactsPatchSchema>;

export const emptyFacts = (): ExtractedFacts => ({ symptoms: [], clarificationRounds: 0 });
