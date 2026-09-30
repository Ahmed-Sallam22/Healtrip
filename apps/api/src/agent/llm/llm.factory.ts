import type { Env } from '../../config/env';
import { AnthropicProvider } from './anthropic.provider';
import type { LlmProvider } from './llm.types';
import { MockLlmProvider } from './mock.provider';
import { OpenAIProvider } from './openai.provider';

/** Selects the LLM adapter from LLM_PROVIDER. Keys are validated at boot (see env.ts). */
export function createLlmProvider(env: Env): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case 'anthropic':
      return new AnthropicProvider(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL, env.ANTHROPIC_EFFORT);
    case 'openai':
      return new OpenAIProvider(env.OPENAI_API_KEY!, env.OPENAI_MODEL);
    default:
      return new MockLlmProvider();
  }
}
