import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Validated environment. The process refuses to boot on invalid/missing config (fail fast). */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    LLM_PROVIDER: z.enum(['mock', 'anthropic', 'openai']).default('mock'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    ANTHROPIC_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
    /** Any OpenAI-compatible endpoint: Gemini, Groq, OpenRouter, DeepSeek, Ollama, LM Studio… Unset = api.openai.com. */
    OPENAI_BASE_URL: z.string().url().optional(),
    /** "required" forces a tool call each step; "auto" for servers/models that reject it (e.g. some local models). */
    OPENAI_TOOL_CHOICE: z.enum(['required', 'auto']).default('required'),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(0.2).default(0.1),
    LLM_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

    AGENT_MAX_TOOL_STEPS: z.coerce.number().int().min(1).max(10).default(5),
    AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    AGENT_MAX_CLARIFY_ROUNDS: z.coerce.number().int().min(0).max(6).default(3),

    RAG_URL: z.string().url().default('http://localhost:8001'),
    RAG_INTERNAL_TOKEN: z.string().min(8).default('dev-internal-token'),
    RAG_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

    RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
    /** Agent trace is returned to the UI (dev/demo). Disable in production. */
    EXPOSE_TRACE: bool.default('true'),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY)
      ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'required when LLM_PROVIDER=anthropic' });
    // A custom base URL may be a keyless local server (Ollama, LM Studio).
    if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY && !env.OPENAI_BASE_URL)
      ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'required when LLM_PROVIDER=openai (unless OPENAI_BASE_URL points to a keyless server)' });
    if (env.NODE_ENV === 'production' && env.RAG_INTERNAL_TOKEN === 'dev-internal-token')
      ctx.addIssue({ code: 'custom', path: ['RAG_INTERNAL_TOKEN'], message: 'must be set in production' });
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** DI token for the validated config object. */
export const ENV = Symbol('ENV');
