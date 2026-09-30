import './config/load-dotenv';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv(); // fail fast on invalid config
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  app.getHttpAdapter().getInstance().set('trust proxy', 1); // correct client IPs for rate limiting behind a proxy
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('HealTrip AI Patient Decision Assistant API')
      .setDescription('Prototype API. All provider data is fictional. Not medical advice.')
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc);

  await app.listen(env.PORT, '0.0.0.0');
  app.get(Logger).log(`API listening on :${env.PORT} (LLM_PROVIDER=${env.LLM_PROVIDER}) — docs at /api/docs`);
}

void bootstrap();
