import { EnvSchema } from './env';

const base = { DATABASE_URL: 'postgresql://localhost/test' };

describe('EnvSchema', () => {
  it('treats an empty OPENAI_BASE_URL as unset (docker compose passes unset vars as "")', () => {
    const parsed = EnvSchema.safeParse({ ...base, OPENAI_BASE_URL: '' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.OPENAI_BASE_URL).toBeUndefined();
  });

  it('rejects a malformed OPENAI_BASE_URL', () => {
    expect(EnvSchema.safeParse({ ...base, OPENAI_BASE_URL: 'not a url' }).success).toBe(false);
  });

  it('requires OPENAI_API_KEY for openai unless a custom base URL is set', () => {
    expect(EnvSchema.safeParse({ ...base, LLM_PROVIDER: 'openai' }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base, LLM_PROVIDER: 'openai', OPENAI_BASE_URL: '' }).success).toBe(false);
    expect(
      EnvSchema.safeParse({ ...base, LLM_PROVIDER: 'openai', OPENAI_BASE_URL: 'http://localhost:11434/v1' }).success,
    ).toBe(true);
  });
});
