import type { DoctorHit, HospitalHit, ToolResult } from '@healtrip/shared';
import { InMemoryProvidersRepository } from '../../test/support/in-memory.repository';
import { chunk, FakeRag } from '../../test/support/fake-rag';
import { buildToolRegistry } from './tool-registry.factory';
import { summarizeResult } from './tool-registry';

const ctx = { sessionId: 's1', locale: 'en' as const };

function setup() {
  const repo = new InMemoryProvidersRepository();
  const rag = new FakeRag((req) =>
    req.query.includes('stent')
      ? [chunk({ chunkId: 'doctor_bio:doc-cai-card-01:en#0', sourceType: 'doctor_bio', sourceId: 'doc-cai-card-01', score: 0.55 })]
      : [],
  );
  return { repo, rag, registry: buildToolRegistry(repo, rag) };
}

const data = <T>(r: ToolResult<unknown>) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data as T;
};

describe('ToolRegistry + handlers', () => {
  it('exposes JSON Schemas generated from the shared Zod schemas', () => {
    const { registry } = setup();
    const spec = registry.specs().find((s) => s.name === 'search_providers')!;
    expect(spec.parameters).toMatchObject({ type: 'object', required: ['specialtyCode'], additionalProperties: false });
  });

  it('rejects invalid args with a typed error instead of throwing', async () => {
    const { registry } = setup();
    const { output } = await registry.execute('search_providers', { specialtyCode: 'cardio; DROP TABLE' }, ctx);
    expect(output.result).toMatchObject({ ok: false, error: { code: 'INVALID_ARGS' } });
  });

  it('returns UNKNOWN_TOOL for tools that do not exist', async () => {
    const { registry } = setup();
    expect((await registry.execute('run_sql', { q: 'select 1' }, ctx)).output.result).toMatchObject({ ok: false, error: { code: 'UNKNOWN_TOOL' } });
  });

  it('maps symptoms to specialties from the curated table (EN + AR)', async () => {
    const { registry } = setup();
    const en = data<{ matches: { specialtyCode: string }[] }>((await registry.execute('map_symptoms_to_specialty', { symptoms: ['chest pain'] }, ctx)).output.result);
    expect(en.matches[0].specialtyCode).toBe('CARDIOLOGY');
    const ar = data<{ matches: { specialtyCode: string }[] }>((await registry.execute('map_symptoms_to_specialty', { symptoms: ['ألم في الركبة'] }, ctx)).output.result);
    expect(ar.matches[0].specialtyCode).toBe('ORTHOPEDICS');
  });

  it('search_providers clamps limit to 5 and applies filters', async () => {
    const { registry } = setup();
    const { output } = await registry.execute('search_providers', { specialtyCode: 'CARDIOLOGY', limit: 50 }, ctx);
    expect(data<{ providers: DoctorHit[] }>(output.result).providers).toHaveLength(5);

    const budget = data<{ providers: DoctorHit[] }>(
      (await registry.execute('search_providers', { specialtyCode: 'CARDIOLOGY', city: 'istanbul', maxFeeUsd: 80, language: 'en' }, ctx)).output.result,
    );
    expect(budget.providers.map((p) => p.id).sort()).toEqual(['doc-ist-card-02', 'doc-ist-card-03']);
    expect(budget.providers.every((p) => p.consultationFeeUsd <= 80 && p.city === 'Istanbul')).toBe(true);
  });

  it('search_providers returns evidence records for grounding', async () => {
    const { registry } = setup();
    const { output } = await registry.execute('search_providers', { specialtyCode: 'ORTHOPEDICS', city: 'الجيزة', secondOpinion: true }, ctx);
    expect(output.evidence?.doctors?.map((d) => d.id).sort()).toEqual(['doc-giz-orth-01', 'doc-giz-orth-02']);
  });

  it('search_providers answers truthfully for out-of-scope cities (no guessing)', async () => {
    const { registry } = setup();
    const r = data<{ providers: unknown[]; note: string }>((await registry.execute('search_providers', { specialtyCode: 'CARDIOLOGY', city: 'Paris' }, ctx)).output.result);
    expect(r.providers).toEqual([]);
    expect(r.note).toMatch(/CITY_NOT_IN_SCOPE/);
  });

  it('search_providers rejects unknown specialty codes with the valid list', async () => {
    const { registry } = setup();
    const { output } = await registry.execute('search_providers', { specialtyCode: 'ASTROLOGY' }, ctx);
    expect(output.result).toMatchObject({ ok: false, error: { code: 'INVALID_ARGS' } });
  });

  it('find_emergency_hospitals only returns ER-capable 24h hospitals', async () => {
    const { registry } = setup();
    const r = data<{ hospitals: HospitalHit[] }>((await registry.execute('find_emergency_hospitals', { city: 'Cairo' }, ctx)).output.result);
    expect(r.hospitals.map((h) => h.id).sort()).toEqual(['hos-cai-01', 'hos-cai-02']);
    expect(r.hospitals.every((h) => h.hasEmergency && h.is24h)).toBe(true);
  });

  it('get_doctor_availability returns NOT_FOUND for unknown doctors', async () => {
    const { registry } = setup();
    expect((await registry.execute('get_doctor_availability', { doctorId: 'doc-fake-999' }, ctx)).output.result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const ok = data<{ slots: unknown[] }>((await registry.execute('get_doctor_availability', { doctorId: 'doc-cai-card-01', days: 90 }, ctx)).output.result);
    expect(ok.slots.length).toBeGreaterThan(0);
  });

  it('search_knowledge_base returns cited chunks, NO_RELEVANT_CONTEXT, or RAG_UNAVAILABLE', async () => {
    const { registry, rag } = setup();
    const hit = await registry.execute('search_knowledge_base', { query: 'heart stent experience', locale: 'en', topK: 99 }, ctx);
    expect(data<{ status: string }>(hit.output.result).status).toBe('OK');
    expect(hit.output.evidence?.chunks?.[0].chunkId).toBe('doctor_bio:doc-cai-card-01:en#0');
    expect(rag.calls[0].topK).toBe(5);

    const none = await registry.execute('search_knowledge_base', { query: 'parking price', locale: 'en' }, ctx);
    expect(data<{ status: string }>(none.output.result).status).toBe('NO_RELEVANT_CONTEXT');

    rag.down = true;
    const down = await registry.execute('search_knowledge_base', { query: 'heart stent', locale: 'en' }, ctx);
    expect(down.output.result).toMatchObject({ ok: false, error: { code: 'RAG_UNAVAILABLE' } });
  });

  it('turns handler exceptions into INTERNAL_ERROR', async () => {
    const { repo, registry } = setup();
    jest.spyOn(repo, 'listSpecialtyCodes').mockRejectedValue(new Error('db down'));
    expect((await registry.execute('search_providers', { specialtyCode: 'CARDIOLOGY' }, ctx)).output.result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('summarizes results without leaking full payloads', () => {
    expect(summarizeResult({ ok: true, data: { providers: [{ id: 'a' }, { id: 'b' }], note: 'x' } })).toEqual({ ok: true, providersCount: 2, providersIds: ['a', 'b'], note: 'x' });
  });
});
