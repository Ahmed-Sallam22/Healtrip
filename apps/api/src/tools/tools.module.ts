import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { ProvidersRepository } from '../providers/providers.repository';
import { RagClientModule } from '../rag-client/rag-client.module';
import { RagClient } from '../rag-client/rag.client';
import { buildToolRegistry } from './tool-registry.factory';
import { ToolRegistry } from './tool-registry';

@Module({
  imports: [ProvidersModule, RagClientModule],
  providers: [{ provide: ToolRegistry, inject: [ProvidersRepository, RagClient], useFactory: buildToolRegistry }],
  exports: [ToolRegistry],
})
export class ToolsModule {}
