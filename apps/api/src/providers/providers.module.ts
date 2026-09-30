import { Module } from '@nestjs/common';
import { PrismaProvidersRepository } from './prisma-providers.repository';
import { ProvidersController } from './providers.controller';
import { ProvidersRepository } from './providers.repository';

@Module({
  controllers: [ProvidersController],
  providers: [{ provide: ProvidersRepository, useClass: PrismaProvidersRepository }],
  exports: [ProvidersRepository],
})
export class ProvidersModule {}
