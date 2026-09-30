import type { RagSearchRequest, RagSearchResponse } from '../../src/rag-client/rag.client';
import { RagUnavailableError } from '../../src/rag-client/rag.client';

type Result = RagSearchResponse['results'][number];

/** Scriptable stand-in for the Python RAG service. */
export class FakeRag {
  down = false;
  calls: RagSearchRequest[] = [];
  constructor(private readonly responder: (req: RagSearchRequest) => Result[] = () => []) {}

  async search(req: RagSearchRequest): Promise<RagSearchResponse> {
    this.calls.push(req);
    if (this.down) throw new RagUnavailableError('connect ECONNREFUSED');
    return { results: this.responder(req), embeddingModel: 'fake', minScore: 0.2 };
  }
}

export const chunk = (over: Partial<Result> & Pick<Result, 'chunkId' | 'sourceType'>): Result => ({
  documentId: over.chunkId.split('#')[0],
  sourceId: null,
  title: 'Sample',
  text: 'Sample text',
  score: 0.6,
  locale: 'en',
  ...over,
});
