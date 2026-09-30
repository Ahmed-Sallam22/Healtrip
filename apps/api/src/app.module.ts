import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AgentModule } from './agent/agent.module';
import { AuditModule } from './audit/audit.module';
import { ChatModule } from './chat/chat.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ConfigModule } from './config/config.module';
import { loadEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { SessionsModule } from './sessions/sessions.module';
import { ToolsModule } from './tools/tools.module';
import { TriageModule } from './triage/triage.module';

const env = loadEnv();

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        // Request ids: honour an incoming X-Request-Id (from a gateway) or mint one; echo it back.
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        // Never log bodies (patient text) or credentials.
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-internal-token"]'],
        serializers: { req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }) },
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: env.RATE_LIMIT_PER_MIN * 3 }]),
    PrismaModule,
    AuditModule,
    TriageModule,
    ProvidersModule,
    ToolsModule,
    AgentModule,
    SessionsModule,
    ChatModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
