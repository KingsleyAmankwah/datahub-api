import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

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

  // Swagger — development only
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DataHub API')
      .setDescription('USSD Data Bundle Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`🚀 DataHub API running on http://localhost:${port}/api`);
}

void bootstrap();
