import { Module } from '@nestjs/common';
import { PrismaSessionsRepository } from './prisma-sessions.repository';
import { SessionsController } from './sessions.controller';
import { SessionsRepository } from './sessions.repository';

@Module({
  controllers: [SessionsController],
  providers: [{ provide: SessionsRepository, useClass: PrismaSessionsRepository }],
  exports: [SessionsRepository],
})
export class SessionsModule {}
