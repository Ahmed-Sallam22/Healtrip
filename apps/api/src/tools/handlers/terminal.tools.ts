import { AskClarifyingQuestionsArgsSchema, SubmitRecommendationArgsSchema, TOOL_NAMES } from '@healtrip/shared';
import type { ToolDefinition } from '../tool.types';

export const submitRecommendationTool: ToolDefinition<typeof SubmitRecommendationArgsSchema> = {
  name: TOOL_NAMES.submitRecommendation,
  description:
    'TERMINAL. Finish the turn with a recommendation. nextStep must be one of the enum values. providers may only contain ids ' +
    'returned by search_providers / find_emergency_hospitals in this turn; citations may only contain chunkIds returned by ' +
    'search_knowledge_base in this turn. The server renders provider cards from the database, so keep `message` short and ' +
    'do not restate fees/ratings unless you copy them exactly from tool results.',
  schema: SubmitRecommendationArgsSchema,
  terminal: true,
};

export const askClarifyingQuestionsTool: ToolDefinition<typeof AskClarifyingQuestionsArgsSchema> = {
  name: TOOL_NAMES.askClarifyingQuestions,
  description:
    'TERMINAL. Finish the turn by asking 1–2 focused questions, only when the answer would change the next step or the ' +
    'provider search (e.g. duration/severity of symptoms, city, budget).',
  schema: AskClarifyingQuestionsArgsSchema,
  terminal: true,
};
