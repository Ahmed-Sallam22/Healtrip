import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  // Connection is lazy (first query) so the API can boot and report DB health even when the DB is down.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
