import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  // Security
  app.use(helmet());

  // All routes prefixed with /api
  app.setGlobalPrefix('api');

  // Auto-validate all incoming request bodies
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`🚀 DataHub API running on http://localhost:${port}/api`);
}
void bootstrap();
