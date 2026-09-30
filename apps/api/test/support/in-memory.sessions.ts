import { randomUUID } from 'node:crypto';
import type { ChatResponse, ExtractedFacts, Locale } from '@healtrip/shared';
import { type MessageRecord, type SessionRecord, SessionsRepository } from '../../src/sessions/sessions.repository';

export class InMemorySessionsRepository extends SessionsRepository {
  sessions = new Map<string, SessionRecord>();
  msgs = new Map<string, MessageRecord[]>();

  async create(locale: Locale, facts: ExtractedFacts) {
    const s = { id: randomUUID(), locale, status: 'active', createdAt: new Date(), facts };
    this.sessions.set(s.id, s);
    this.msgs.set(s.id, []);
    return s;
  }
  async find(id: string) { return this.sessions.get(id) ?? null; }
  async messages(id: string, limit = 50) { return (this.msgs.get(id) ?? []).slice(-limit); }
  async appendMessage(id: string, m: { role: 'user' | 'assistant'; content: string; payload?: ChatResponse }) {
    const rec = { id: randomUUID(), role: m.role, content: m.content, payload: m.payload ?? null, createdAt: new Date() };
    this.msgs.get(id)!.push(rec);
    return rec;
  }
  async updateFacts(id: string, facts: ExtractedFacts) { this.sessions.get(id)!.facts = facts; }
}
