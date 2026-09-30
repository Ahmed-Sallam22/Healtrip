import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse } from './llm.types';

/**
 * Claude via the official SDK with native tool use (manual loop — the orchestrator owns it).
 *
 * Notes on current models (claude-opus-5-5 default):
 *  - sampling params (temperature) are rejected on current models, so determinism comes from low
 *    `effort`, the constrained tool schemas and the server-side validator instead;
 *  - forced tool_choice ("any") is rejected, so we use "auto" and enforce terminal tools server-side;
 *  - assistant content (incl. thinking blocks) is replayed verbatim within a turn via `raw`;
 *  - server-side refusal fallbacks are enabled for the models that support them.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly effort: 'low' | 'medium' | 'high',
  ) {
    // Retries are owned by the orchestrator (single retry + global deadline).
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const legacySampling = /haiku|claude-3|-4-5|-4-6/.test(this.model);
    const supportsEffort = !/haiku|claude-3|sonnet-4-5|opus-4-1/.test(this.model);
    const supportsFallbacks = /^claude-(?:opus-5|sonnet-5-5|fable-5)/.test(this.model);

    const params: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice: { type: 'auto' },
      ...(legacySampling ? { temperature: req.temperature } : {}),
      ...(supportsEffort ? { output_config: { effort: this.effort } } : {}),
      ...(supportsFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    };

    let res: Anthropic.Beta.BetaMessage;
    try {
      res = (await this.client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming, {
        signal: req.signal,
      })) as Anthropic.Beta.BetaMessage;
    } catch (err) {
      throw toLlmError(err);
    }

    if (res.stop_reason === 'refusal') throw new LlmError('Model declined the request (refusal)', false);

    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const toolCalls = res.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, args: b.input }));
    return {
      text: text || null,
      toolCalls,
      stopReason: res.stop_reason ?? 'unknown',
      raw: res.content,
      usage: { inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens },
    };
  }
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  const push = (role: 'user' | 'assistant', blocks: Anthropic.Beta.BetaContentBlockParam[]) => {
    const last = out[out.length - 1];
    // Consecutive same-role messages are merged (e.g. tool results followed by a server notice).
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'user') push('user', [{ type: 'text', text: m.content }]);
    else if (m.role === 'tool')
      push(
        'user',
        m.results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.toolCallId, content: r.content, is_error: r.isError })),
      );
    else if (m.raw) push('assistant', m.raw as Anthropic.Beta.BetaContentBlockParam[]);
    else {
      const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args as Record<string, unknown> });
      if (blocks.length) push('assistant', blocks);
    }
  }
  return out;
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('Anthropic request timed out', true);
  if (err instanceof Anthropic.APIConnectionError) return new LlmError('Anthropic connection error', true);
  if (err instanceof Anthropic.RateLimitError) return new LlmError('Anthropic rate limited', true, 429);
  if (err instanceof Anthropic.InternalServerError) return new LlmError('Anthropic server error', true, err.status);
  if (err instanceof Anthropic.APIError) return new LlmError(`Anthropic API error ${err.status}: ${err.message}`, false, err.status);
  if ((err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError') return new LlmError('LLM call aborted (deadline)', false);
  return new LlmError(`Anthropic call failed: ${(err as Error)?.message}`, false);
}
