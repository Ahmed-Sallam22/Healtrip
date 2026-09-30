import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { RagClientModule } from '../rag-client/rag-client.module';
import { HealthController } from './health.controller';

@Module({ imports: [AgentModule, RagClientModule], controllers: [HealthController] })
export class HealthModule {}
