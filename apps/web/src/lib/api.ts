import type {
  ApiErrorBody,
  ApiErrorCode,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  SessionResponse,
  TraceEntry,
} from '@healtrip/shared';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

/** Client-side codes for failures that never produced a server error body. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'BAD_RESPONSE';

/** Every failure surfaced to the UI is an ApiError: either the server's envelope or a client-side one. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | ClientErrorCode;
  readonly messageAr: string | null;
  readonly requestId: string | null;
  readonly status: number | null;

  constructor(init: {
    code: ApiErrorCode | ClientErrorCode;
    message: string;
    messageAr?: string | null;
    requestId?: string | null;
    status?: number | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.messageAr = init.messageAr ?? null;
    this.requestId = init.requestId ?? null;
    this.status = init.status ?? null;
  }

  static fromBody(body: ApiErrorBody, status: number | null = null): ApiError {
    return new ApiError({ ...body, status });
  }

  /** True for client-side failures, where the UI shows its own localized copy. */
  get isClientError(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'BAD_RESPONSE';
  }
}

export const isAbortError = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.message === 'string';
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error page (proxy, crash) — fall through to a generic error.
  }
  if (isApiErrorBody(body)) {
    return ApiError.fromBody(
      { ...body, messageAr: body.messageAr ?? body.message, requestId: body.requestId ?? '' },
      res.status,
    );
  }
  return new ApiError({ code: 'BAD_RESPONSE', message: `HTTP ${res.status}`, status: res.status });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError({ code: 'NETWORK_ERROR', message: String(err) });
  }
  if (!res.ok) throw await errorFromResponse(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError({ code: 'BAD_RESPONSE', message: 'Invalid JSON response', status: res.status });
  }
}

// ---------------------------------------------------------------- endpoints

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  checks: Record<string, unknown>;
}

/** Never throws: an unreachable API is reported as status 'error'. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse['status']> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal, headers: { Accept: 'application/json' } });
    const body = (await res.json().catch(() => null)) as Partial<HealthResponse> | null;
    if (body?.status === 'ok' || body?.status === 'degraded' || body?.status === 'error') return body.status;
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export function getSession(id: string, signal?: AbortSignal): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}`, { signal });
}

export function postChat(body: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(body), signal });
}

// ---------------------------------------------------------------- SSE

export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Incremental parser for the text/event-stream format (WHATWG spec subset: event, data, comments).
 * Feed it decoded text chunks of any size; it returns every message completed by that chunk.
 */
export class SseParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];

  feed(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    // A trailing lone '\r' may be the first half of '\r\n' — keep it buffered until more text arrives.
    const lineBreak = /\r\n|\r(?!$)|\n/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = lineBreak.exec(this.buffer)) !== null) {
      const msg = this.processLine(this.buffer.slice(start, match.index));
      if (msg) out.push(msg);
      start = match.index + match[0].length;
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  /** Call at end of stream: dispatches a final message that lacked its terminating blank line. */
  flush(): SseMessage[] {
    const out: SseMessage[] = [];
    if (this.buffer) {
      const msg = this.processLine(this.buffer.replace(/\r$/, ''));
      if (msg) out.push(msg);
      this.buffer = '';
    }
    const last = this.processLine('');
    if (last) out.push(last);
    return out;
  }

  private processLine(line: string): SseMessage | null {
    if (line === '') {
      if (this.data.length === 0) {
        this.event = '';
        return null;
      }
      const msg = { event: this.event || 'message', data: this.data.join('\n') };
      this.event = '';
      this.data = [];
      return msg;
    }
    if (line.startsWith(':')) return null; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
    // 'id' and 'retry' are irrelevant for a single POST stream.
    return null;
  }
}

function toStreamEvent(msg: SseMessage): ChatStreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(msg.data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const type = (parsed as { type?: unknown }).type ?? msg.event;
  return { ...(parsed as object), type } as ChatStreamEvent;
}

/** Marker for "the stream endpoint is unusable, nothing was received — safe to retry via POST /api/chat". */
class StreamUnavailable extends Error {}

/**
 * Sends a chat turn over POST /api/chat/stream, reporting trace entries as they arrive.
 * Falls back to POST /api/chat when the stream endpoint fails before emitting any event
 * (network error, 404/405, non-SSE response). Once an event was received we never retry,
 * because the server may already have persisted the turn.
 */
export async function streamChat(
  body: ChatRequest,
  onTrace: (entry: TraceEntry) => void,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  try {
    return await readChatStream(body, onTrace, signal);
  } catch (err) {
    if (err instanceof StreamUnavailable) return postChat(body, signal);
    throw err;
  }
}

async function readChatStream(
  body: ChatRequest,
  onTrace: (entry: TraceEntry) => void,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new StreamUnavailable(String(err));
  }

  if (res.status === 404 || res.status === 405 || res.status === 501) throw new StreamUnavailable(`HTTP ${res.status}`);
  // Validation / rate-limit / etc. are real answers: surface them instead of retrying.
  if (!res.ok) throw await errorFromResponse(res);
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.body || !contentType.includes('text/event-stream')) throw new StreamUnavailable('not an event stream');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  let receivedAny = false;

  const handle = (messages: SseMessage[]): ChatResponse | null => {
    for (const msg of messages) {
      const event = toStreamEvent(msg);
      if (!event) continue;
      receivedAny = true;
      if (event.type === 'trace') onTrace(event.entry);
      else if (event.type === 'final') return event.response;
      else if (event.type === 'error') throw ApiError.fromBody(event.error, res.status);
    }
    return null;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      const final = handle(done ? parser.flush() : parser.feed(value));
      if (final) return final;
      if (done) break;
    }
  } catch (err) {
    if (err instanceof ApiError || isAbortError(err)) throw err;
    if (!receivedAny) throw new StreamUnavailable(String(err));
    throw new ApiError({ code: 'NETWORK_ERROR', message: String(err) });
  } finally {
    reader.cancel().catch(() => undefined);
  }

  if (!receivedAny) throw new StreamUnavailable('empty stream');
  throw new ApiError({ code: 'BAD_RESPONSE', message: 'Stream ended without a final event' });
}
