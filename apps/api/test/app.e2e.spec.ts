/**
 * HTTP e2e: boots the real AppModule (controllers, Zod pipes, exception filter, throttler,
 * helmet, SSE, DI wiring) and swaps only the edges — Postgres, RAG, audit — for in-memory fakes.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProvidersRepository } from '../src/providers/providers.repository';
import { RagClient } from '../src/rag-client/rag.client';
import { SessionsRepository } from '../src/sessions/sessions.repository';
import { demoRag } from './support/agent-harness';
import { InMemoryProvidersRepository } from './support/in-memory.repository';
import { InMemorySessionsRepository } from './support/in-memory.sessions';

describe('HTTP API (e2e, real Nest app)', () => {
  let app: INestApplication;
  const rag = Object.assign(demoRag(), { health: jest.fn().mockResolvedValue({ status: 'ok', documents: 90 }) });
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]), $disconnect: jest.fn(), onModuleDestroy: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(ProvidersRepository).useValue(new InMemoryProvidersRepository())
      .overrideProvider(SessionsRepository).useValue(new InMemorySessionsRepository())
      .overrideProvider(RagClient).useValue(rag)
      .overrideProvider(AuditService).useValue({ logToolCall: jest.fn().mockResolvedValue(undefined), logAgentRun: jest.fn().mockResolvedValue(undefined) })
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }), { CORS_ORIGINS: 'http://localhost:3000' });
    await app.init();
  });
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  it('POST /api/chat: emergency path returns EMERGENCY_NOW with a request id and security headers', async () => {
    const res = await http().post('/api/chat').send({ message: 'chest pain spreading to my left arm and sweating', locale: 'en' }).expect(200);
    expect(res.body).toMatchObject({ source: 'triage', nextStep: 'EMERGENCY_NOW' });
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,}$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff'); // helmet
  });

  it('POST /api/chat: session memory round-trip + GET /api/sessions/:id', async () => {
    const first = await http().post('/api/chat').send({ message: 'I have mild chest pain', locale: 'en' }).expect(200);
    expect(first.body.clarifyingQuestions.length).toBeGreaterThan(0);
    const second = await http().post('/api/chat').send({ sessionId: first.body.sessionId, message: '2 weeks, 3/10, no sweating, Cairo', locale: 'en' }).expect(200);
    expect(second.body.nextStep).toBe('BOOK_SPECIALIST');
    const session = await http().get(`/api/sessions/${first.body.sessionId}`).expect(200);
    expect(session.body.extractedFacts).toMatchObject({ city: 'Cairo', durationDays: 14 });
    expect(session.body.messages).toHaveLength(4);
  });

  it('validation errors use the bilingual envelope', async () => {
    const res = await http().post('/api/chat').send({ message: '', locale: 'fr', extra: 1 }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', messageAr: expect.any(String), requestId: expect.any(String) });
    expect(res.body.details.length).toBeGreaterThan(0);
    await http().get('/api/sessions/not-a-uuid').expect(400);
  });

  it('unknown session → 404 NOT_FOUND', async () => {
    const res = await http().post('/api/chat').send({ sessionId: '11111111-1111-4111-8111-111111111111', message: 'hi', locale: 'en' }).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('POST /api/chat/stream emits trace events then a final event (SSE)', async () => {
    const res = await http().post('/api/chat/stream').send({ message: 'I need a dermatologist in Alexandria', locale: 'en' }).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = [...res.text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    expect(events.filter((e) => e === 'trace').length).toBeGreaterThan(2);
    expect(events.at(-1)).toBe('final');
    const final = JSON.parse(res.text.trim().split('\n').at(-1)!.replace(/^data: /, ''));
    expect(final.response.providers[0]).toMatchObject({ kind: 'doctor', specialty: { code: 'DERMATOLOGY' } });
  });

  it('GET /api/health: ok, degraded when RAG is down, error (503) when the DB is down', async () => {
    expect((await http().get('/api/health').expect(200)).body.status).toBe('ok');
    rag.health.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await http().get('/api/health').expect(200)).body.status).toBe('degraded');
    prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    expect((await http().get('/api/health').expect(503)).body.status).toBe('error');
  });

  it('GET /api/providers: debug search', async () => {
    const res = await http().get('/api/providers?specialty=CARDIOLOGY&city=istanbul').expect(200);
    expect(res.body.doctors.every((d: { city: string }) => d.city === 'Istanbul')).toBe(true);
  });

  it('rate limits chat with a 429 RATE_LIMITED envelope', async () => {
    let last = 0;
    let body: { code?: string } = {};
    for (let i = 0; i < 25 && last !== 429; i++) {
      const res = await http().post('/api/chat').send({});
      last = res.status;
      body = res.body;
    }
    expect(last).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
  });
});
