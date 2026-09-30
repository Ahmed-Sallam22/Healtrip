import './config/load-dotenv';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv(); // fail fast on invalid config
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);
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
