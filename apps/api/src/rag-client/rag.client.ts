import { Inject, Injectable, Logger } from '@nestjs/common';
import type { KnowledgeChunk, Locale, SourceType } from '@healtrip/shared';
import { ENV, type Env } from '../config/env';

export class RagUnavailableError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
  }
}

export interface RagSearchRequest {
  query: string;
  locale: Locale;
  sourceTypes?: SourceType[];
  topK: number;
}

export interface RagSearchResponse {
  results: (KnowledgeChunk & { documentId: string; locale: string })[];
  embeddingModel: string;
  minScore: number;
}

/**
 * HTTP client for the internal Python RAG service.
 * - hard timeout (default 3s) on the whole call, including one retry for transient failures
 * - shared-secret header; the RAG service is never exposed publicly
 * - failures surface as RagUnavailableError so the tool can degrade gracefully
 */
@Injectable()
export class RagClient {
  private readonly logger = new Logger(RagClient.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async search(req: RagSearchRequest, requestId?: string): Promise<RagSearchResponse> {
    return this.post<RagSearchResponse>('/search', req, requestId);
  }

  async health(): Promise<{ status: string; documents?: number }> {
    const res = await fetch(new URL('/health', this.env.RAG_URL), { signal: AbortSignal.timeout(this.env.RAG_TIMEOUT_MS) });
    if (!res.ok) throw new RagUnavailableError(`RAG health returned ${res.status}`);
    return (await res.json()) as { status: string; documents?: number };
  }

  private async post<T>(path: string, body: unknown, requestId?: string): Promise<T> {
    const deadline = Date.now() + this.env.RAG_TIMEOUT_MS;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 50) break;
      try {
        const res = await fetch(new URL(path, this.env.RAG_URL), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-token': this.env.RAG_INTERNAL_TOKEN,
            ...(requestId ? { 'x-request-id': requestId } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(remaining),
        });
        if (res.status >= 500) {
          lastError = new Error(`RAG ${path} returned ${res.status}`);
          continue; // transient: retry once if time allows
        }
        if (!res.ok) throw new RagUnavailableError(`RAG ${path} returned ${res.status}: ${await res.text()}`);
        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof RagUnavailableError) throw err;
        lastError = err;
        if ((err as Error).name === 'TimeoutError') break; // no time left for a retry
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    this.logger.warn({ path, err: String(lastError) }, 'RAG service unavailable');
    throw new RagUnavailableError('RAG service unavailable', lastError);
  }
}
