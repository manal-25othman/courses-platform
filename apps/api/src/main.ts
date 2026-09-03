import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { RlsDenialFilter } from './common/rls-denial.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // All routes live under /api/v1 so a future mobile app can pin to a version
  // while the web app moves on (ARCHITECTURE 13.1, SRS 43).
  app.setGlobalPrefix('api/v1');

  // The website receives its tokens in httpOnly cookies, which this reads.
  app.use(cookieParser());

  // A teacher's grammar picture is capped at 2 MB and arrives base64-encoded,
  // which is about a third larger again. Express allows 100 kB by default, so
  // the limit is raised to fit one — and no further, because a larger body is
  // a larger thing to reject. The picture itself is checked again in the
  // content service, which is where the real limit lives.
  app.use(json({ limit: '4mb' }));

  // Reject anything that does not match its declared shape, before it reaches
  // the domain (SRS 37 input validation).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // A query the row-level policies refuse is answered "not found", so a
  // stranger cannot tell another school's content from an address with
  // nothing behind it.
  app.useGlobalFilters(new RlsDenialFilter());

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({ origin: corsOrigin, credentials: true });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);

  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
