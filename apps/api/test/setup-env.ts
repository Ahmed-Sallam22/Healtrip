// Deterministic, offline test environment: mock LLM, no real network.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/healtrip_test';
process.env.LLM_PROVIDER = 'mock';
process.env.LOG_LEVEL = 'silent';
