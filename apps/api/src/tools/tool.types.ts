import type { Locale, ToolResult, KnowledgeChunk } from '@healtrip/shared';
import type { ZodTypeAny, z } from 'zod';
import type { DoctorRecord, HospitalRecord } from '../providers/providers.repository';

export interface ToolContext {
  sessionId: string;
  requestId?: string;
  locale: Locale;
}

/**
 * Server-side facts a tool call produced. The model only ever sees the compact `result`;
 * `evidence` keeps the full DB records/chunks so the GroundingValidator can check every claim
 * in the final answer against what was actually returned this turn.
 */
export interface EvidencePatch {
  doctors?: DoctorRecord[];
  hospitals?: HospitalRecord[];
  chunks?: KnowledgeChunk[];
}

export interface ToolOutput<T = unknown> {
  result: ToolResult<T>;
  evidence?: EvidencePatch;
}

export interface ToolDefinition<S extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  /** Terminal tools end the turn; the orchestrator validates them instead of executing them. */
  terminal: boolean;
  handler?: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolOutput>;
}

export const ok = <T>(data: T, evidence?: EvidencePatch): ToolOutput<T> => ({ result: { ok: true, data }, evidence });
export const fail = (code: Parameters<typeof failResult>[0], message: string, details?: unknown): ToolOutput<never> => ({
  result: failResult(code, message, details),
});
const failResult = (
  code: 'INVALID_ARGS' | 'NOT_FOUND' | 'RAG_UNAVAILABLE' | 'NO_RELEVANT_CONTEXT' | 'INTERNAL_ERROR' | 'UNKNOWN_TOOL',
  message: string,
  details?: unknown,
) => ({ ok: false as const, error: { code, message, details } });

/** Heterogeneous registry entry (handler arg types differ per tool; each is validated by its own schema). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any>;
