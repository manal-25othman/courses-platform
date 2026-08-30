import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // All routes live under /api/v1 so a future mobile app can pin to a version
  // while the web app moves on (ARCHITECTURE 13.1, SRS 43).
  app.setGlobalPrefix('api/v1');

  // The website receives its tokens in httpOnly cookies, which this reads.
  app.use(cookieParser());

  // Reject anything that does not match its declared shape, before it reaches
  // the domain (SRS 37 input validation).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({ origin: corsOrigin, credentials: true });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);

  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
