import type { ChatResponse, ExtractedFacts, Locale } from '@healtrip/shared';

export interface SessionRecord {
  id: string;
  locale: Locale;
  status: string;
  createdAt: Date;
  facts: ExtractedFacts;
}

export interface MessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  payload: ChatResponse | null;
  createdAt: Date;
}

/** Persistence port for chat sessions (Prisma in the app, in-memory in tests). */
export abstract class SessionsRepository {
  abstract create(locale: Locale, facts: ExtractedFacts): Promise<SessionRecord>;
  abstract find(id: string): Promise<SessionRecord | null>;
  abstract messages(sessionId: string, limit?: number): Promise<MessageRecord[]>;
  abstract appendMessage(sessionId: string, msg: { role: 'user' | 'assistant'; content: string; payload?: ChatResponse }): Promise<MessageRecord>;
  abstract updateFacts(sessionId: string, facts: ExtractedFacts, locale: Locale): Promise<void>;
}
