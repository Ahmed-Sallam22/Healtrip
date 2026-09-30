import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AuditModule } from '../audit/audit.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { ProvidersModule } from '../providers/providers.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TriageModule } from '../triage/triage.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ResponseBuilder } from './response.builder';

@Module({
  imports: [AgentModule, AuditModule, GuardrailsModule, ProvidersModule, SessionsModule, TriageModule],
  controllers: [ChatController],
  providers: [ChatService, ResponseBuilder],
})
export class ChatModule {}
