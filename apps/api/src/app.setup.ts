import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { Env } from './config/env';

/** HTTP-level configuration shared by main.ts and the HTTP e2e tests (so tests exercise the real setup). */
export function configureApp(app: INestApplication, env: Pick<Env, 'CORS_ORIGINS'>): INestApplication {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  app.getHttpAdapter().getInstance().set('trust proxy', 1); // correct client IPs for rate limiting behind a proxy
  return app;
}
