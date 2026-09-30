import { z } from 'zod';

export const LocaleSchema = z.enum(['ar', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

/** The only next steps the assistant may recommend. Constrained enum = no free-form triage. */
export const NEXT_STEPS = [
  'EMERGENCY_NOW',
  'URGENT_CARE_24H',
  'BOOK_SPECIALIST',
  'SECOND_OPINION',
  'GENERAL_PRACTITIONER',
  'SELF_CARE_MONITOR',
] as const;
export const NextStepSchema = z.enum(NEXT_STEPS);
export type NextStep = z.infer<typeof NextStepSchema>;

/**
 * Acuity rank used to enforce "deterministic triage can never be overridden downward".
 * SECOND_OPINION and BOOK_SPECIALIST share a rank: both are planned (non-urgent) specialist care.
 */
export const NEXT_STEP_ACUITY: Record<NextStep, number> = {
  EMERGENCY_NOW: 5,
  URGENT_CARE_24H: 4,
  BOOK_SPECIALIST: 3,
  SECOND_OPINION: 3,
  GENERAL_PRACTITIONER: 2,
  SELF_CARE_MONITOR: 1,
};

export const UrgencySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type Urgency = z.infer<typeof UrgencySchema>;

export const SourceTypeSchema = z.enum(['doctor_bio', 'hospital_profile', 'patient_guide']);
export type SourceType = z.infer<typeof SourceTypeSchema>;
