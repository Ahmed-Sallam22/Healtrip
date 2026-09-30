import { type KnowledgeChunk, SearchKnowledgeBaseArgsSchema, TOOL_NAMES } from '@healtrip/shared';
import { truncate } from '../../common/text';
import { type RagClient, RagUnavailableError } from '../../rag-client/rag.client';
import { fail, ok, type ToolDefinition } from '../tool.types';

const MAX_TOP_K = 5;

export function searchKnowledgeBaseTool(rag: RagClient): ToolDefinition<typeof SearchKnowledgeBaseArgsSchema> {
  return {
    name: TOOL_NAMES.searchKnowledgeBase,
    description:
      'Semantic search over HealTrip\'s knowledge base: doctor bios, hospital profiles and patient-guidance articles. ' +
      'Use for unstructured questions (a doctor\'s procedures/experience, how a process works). Returns chunks with chunkId; ' +
      'cite every chunk you rely on. Structured facts (fees, city, availability) must still come from SQL tools. ' +
      'status NO_RELEVANT_CONTEXT means the answer is not in the knowledge base: say you do not have that information.',
    schema: SearchKnowledgeBaseArgsSchema,
    terminal: false,
    handler: async (args, ctx) => {
      try {
        const res = await rag.search(
          { query: args.query, locale: args.locale, sourceTypes: args.sourceTypes, topK: Math.min(args.topK ?? MAX_TOP_K, MAX_TOP_K) },
          ctx.requestId,
        );
        // The RAG service already applies its similarity threshold; we re-check defensively.
        const chunks: KnowledgeChunk[] = res.results
          .filter((r) => r.score >= res.minScore)
          .map((r) => ({
            chunkId: r.chunkId,
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            title: r.title,
            text: truncate(r.text, 900),
            score: Math.round(r.score * 1000) / 1000,
          }));
        if (!chunks.length) {
          return ok({ status: 'NO_RELEVANT_CONTEXT', chunks: [], instruction: 'Tell the user you do not have this information. Do not guess.' });
        }
        return ok({ status: 'OK', chunks }, { chunks });
      } catch (err) {
        if (err instanceof RagUnavailableError) {
          return fail('RAG_UNAVAILABLE', 'Knowledge base is temporarily unavailable. Continue with SQL tools only and do not answer from memory.');
        }
        throw err;
      }
    },
  };
}
