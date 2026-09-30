/**
 * Provider-neutral LLM contract. The orchestrator only speaks this format; each provider adapter
 * (Anthropic, OpenAI, Mock) translates it to its own wire format. Swapping providers is an env change.
 */
export interface LlmToolSpec {
  name: string;
  description: string;
  /** JSON Schema generated from the tool's Zod schema. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      toolCalls?: LlmToolCall[];
      /** Provider-native content to replay verbatim inside the same turn (e.g. Anthropic thinking blocks). */
      raw?: unknown;
    }
  | { role: 'tool'; results: { toolCallId: string; toolName: string; content: string; isError: boolean }[] };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolSpec[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface LlmResponse {
  text: string | null;
  toolCalls: LlmToolCall[];
  stopReason: string;
  raw?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
