import OpenAI from 'openai';
import { LlmError, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse } from './llm.types';

/** OpenAI function calling. tool_choice "required" forces a tool call every step. */
export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(apiKey: string, readonly model: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 0 });
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
          tool_choice: 'required',
        },
        { signal: req.signal },
      );
      const choice = res.choices[0];
      const toolCalls = (choice?.message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) }));
      return {
        text: choice?.message.content ?? null,
        toolCalls,
        stopReason: choice?.finish_reason ?? 'unknown',
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
