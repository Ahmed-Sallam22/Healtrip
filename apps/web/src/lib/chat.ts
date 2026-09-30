import type { ChatResponse, SessionResponse, TraceEntry } from '@healtrip/shared';

export type UiMessage =
  | { id: string; role: 'user'; content: string }
  /** `response` is null for restored assistant turns stored without a structured payload. */
  | { id: string; role: 'assistant'; content: string; response: ChatResponse | null };

export function sessionToMessages(session: SessionResponse): UiMessage[] {
  return session.messages.map((m) =>
    m.role === 'user'
      ? { id: m.id, role: 'user', content: m.content }
      : { id: m.id, role: 'assistant', content: m.payload?.reply ?? m.content, response: m.payload },
  );
}

export function latestAssistantResponse(messages: UiMessage[]): ChatResponse | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant') return m.response;
  }
  return null;
}

/** Friendly label for a streamed trace step: known tool name → step type → raw name. */
export function traceLabel(
  entry: TraceEntry,
  labels: { names: Record<string, string>; types: Record<string, string> },
): string {
  return labels.names[entry.name] ?? labels.types[entry.type] ?? entry.name;
}

const SESSION_STORAGE_KEY = 'healtrip.sessionId';

export function readStoredSessionId(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSessionId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(SESSION_STORAGE_KEY, id);
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Non-fatal: the conversation just won't survive a reload.
  }
}

let counter = 0;
export const localId = (prefix: string): string => `${prefix}-${Date.now()}-${++counter}`;
