import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { ToolsModule } from '../tools/tools.module';
import { AgentOrchestrator, TOOL_CALL_SINK } from './agent.orchestrator';
import { GroundingValidator } from './grounding.validator';
import { createLlmProvider } from './llm/llm.factory';
import { LLM_PROVIDER } from './llm/llm.types';

@Module({
  imports: [ToolsModule, AuditModule],
  providers: [
    { provide: LLM_PROVIDER, inject: [ENV], useFactory: (env: Env) => createLlmProvider(env) },
    { provide: TOOL_CALL_SINK, useExisting: AuditService },
    GroundingValidator,
    AgentOrchestrator,
  ],
  exports: [AgentOrchestrator, ToolsModule],
})
export class AgentModule {}
