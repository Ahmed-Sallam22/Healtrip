import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type ChatResponse, emptyFacts, ExtractedFactsSchema, type ExtractedFacts, type Locale } from '@healtrip/shared';
import { PrismaService } from '../prisma/prisma.service';
import { type MessageRecord, type SessionRecord, SessionsRepository } from './sessions.repository';

@Injectable()
export class PrismaSessionsRepository extends SessionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(locale: Locale, facts: ExtractedFacts): Promise<SessionRecord> {
    const s = await this.prisma.chatSession.create({ data: { locale, extractedFacts: facts as Prisma.InputJsonValue } });
    return toSession(s);
  }

  async find(id: string): Promise<SessionRecord | null> {
    const s = await this.prisma.chatSession.findUnique({ where: { id } });
    return s ? toSession(s) : null;
  }

  async messages(sessionId: string, limit = 50): Promise<MessageRecord[]> {
    const rows = await this.prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.reverse().map(toMessage);
  }

  async appendMessage(sessionId: string, msg: { role: 'user' | 'assistant'; content: string; payload?: ChatResponse }): Promise<MessageRecord> {
    const row = await this.prisma.chatMessage.create({
      data: { sessionId, role: msg.role, content: msg.content, payload: (msg.payload ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    return toMessage(row);
  }

  async updateFacts(sessionId: string, facts: ExtractedFacts, locale: Locale): Promise<void> {
    await this.prisma.chatSession.update({ where: { id: sessionId }, data: { extractedFacts: facts as Prisma.InputJsonValue, locale } });
  }
}

function toSession(s: { id: string; locale: string; status: string; createdAt: Date; extractedFacts: Prisma.JsonValue }): SessionRecord {
  const facts = ExtractedFactsSchema.safeParse(s.extractedFacts);
  return { id: s.id, locale: s.locale as Locale, status: s.status, createdAt: s.createdAt, facts: facts.success ? facts.data : emptyFacts() };
}

function toMessage(m: { id: string; role: string; content: string; payload: Prisma.JsonValue; createdAt: Date }): MessageRecord {
  return { id: m.id, role: m.role as 'user' | 'assistant', content: m.content, payload: (m.payload as ChatResponse | null) ?? null, createdAt: m.createdAt };
}
