import OpenAI from 'openai';
import { LlmError, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse } from './llm.types';

export interface OpenAIProviderOptions {
  /** OpenAI-compatible endpoint (Gemini, Groq, OpenRouter, DeepSeek, Ollama…). Defaults to api.openai.com. */
  baseURL?: string;
  toolChoice?: 'required' | 'auto';
}

/**
 * OpenAI function calling — also serves any OpenAI-compatible API via `baseURL`.
 * tool_choice "required" forces a tool call every step; the orchestrator still enforces terminal tools under "auto".
 */
export class OpenAIProvider implements LlmProvider {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly toolChoice: 'required' | 'auto';

  constructor(apiKey: string, readonly model: string, opts: OpenAIProviderOptions = {}) {
    this.client = new OpenAI({ apiKey, baseURL: opts.baseURL, maxRetries: 0 });
    this.toolChoice = opts.toolChoice ?? 'required';
    // Show the real backend in traces/health (e.g. "openai:generativelanguage.googleapis.com").
    this.name = opts.baseURL ? `openai:${hostOf(opts.baseURL)}` : 'openai';
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    try {
      const res = await this.client.chat.completions.create(
        {
          model: this.model,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          messages: [{ role: 'system', content: req.system }, ...toOpenAiMessages(req.messages)],
          tools: req.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: this.toolChoice,
        },
        { signal: req.signal },
      );
      const choice = res.choices[0];
      const toolCalls = (choice?.message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) }));
      return {
        text: choice?.message.content ?? null,
        toolCalls,
        stopReason: choice?.finish_reason ?? 'unknown',
        // Replayed verbatim within the turn: some compatible APIs (Gemini 3) attach thought signatures
        // to tool calls and reject follow-up requests that drop them.
        raw: choice?.message,
        usage: { inputTokens: res.usage?.prompt_tokens, outputTokens: res.usage?.completion_tokens },
      };
    } catch (err) {
      if (err instanceof OpenAI.APIConnectionError) return Promise.reject(new LlmError('OpenAI connection error', true));
      if (err instanceof OpenAI.APIError) {
        const status = err.status ?? 0;
        return Promise.reject(new LlmError(`OpenAI API error ${status}`, status === 429 || status >= 500, status));
      }
      throw new LlmError(`OpenAI call failed: ${(err as Error).message}`, false);
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'custom';
  }
}

/** Invalid JSON from the model becomes a marker object that fails Zod validation (→ INVALID_ARGS). */
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { __invalidJson: s.slice(0, 200) };
  }
}

function toOpenAiMessages(messages: LlmMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.flatMap((m): OpenAI.Chat.ChatCompletionMessageParam[] => {
    if (m.role === 'user') return [{ role: 'user', content: m.content }];
    if (m.role === 'tool') return m.results.map((r) => ({ role: 'tool' as const, tool_call_id: r.toolCallId, content: r.content }));
    if (m.raw) return [m.raw as OpenAI.Chat.ChatCompletionAssistantMessageParam];
    return [
      {
        role: 'assistant',
        content: m.content,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
          : {}),
      },
    ];
  });
}
