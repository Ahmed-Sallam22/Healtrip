import type { ProvidersRepository } from '../providers/providers.repository';
import type { RagClient } from '../rag-client/rag.client';
import { findEmergencyHospitalsTool } from './handlers/find-emergency-hospitals.tool';
import { getDoctorAvailabilityTool } from './handlers/get-doctor-availability.tool';
import { mapSymptomsTool } from './handlers/map-symptoms.tool';
import { searchKnowledgeBaseTool } from './handlers/search-knowledge-base.tool';
import { searchProvidersTool } from './handlers/search-providers.tool';
import { askClarifyingQuestionsTool, submitRecommendationTool } from './handlers/terminal.tools';
import { ToolRegistry } from './tool-registry';

export function buildToolRegistry(repo: ProvidersRepository, rag: Pick<RagClient, 'search'>): ToolRegistry {
  return new ToolRegistry([
    mapSymptomsTool(repo),
    searchProvidersTool(repo),
    findEmergencyHospitalsTool(repo),
    getDoctorAvailabilityTool(repo),
    searchKnowledgeBaseTool(rag as RagClient),
    submitRecommendationTool,
    askClarifyingQuestionsTool,
  ]);
}
