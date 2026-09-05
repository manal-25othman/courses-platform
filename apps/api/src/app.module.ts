import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { attemptSubject } from './auth/guards/auth-throttle.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { SettingsModule } from './settings/settings.module';
import { StudentsModule } from './students/students.module';
import { AdminModule } from './admin/admin.module';
import { SchoolModule } from './school/school.module';
import { ContentModule } from './content/content.module';
import { QuestionsModule } from './questions/questions.module';
import { LearningModule } from './learning/learning.module';
import { TeachersModule } from './teachers/teachers.module';
import { ProgressModule } from './progress/progress.module';
import { MessagesModule } from './messages/messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Applied only where it is declared, not to every endpoint, so normal use
    // of the app is never rate limited.
    //
    // Two limits, because they answer different questions. `auth` counts
    // attempts against one account, which is what guessing a password means
    // and what ten a minute was always meant to stop; see attemptSubject for
    // why the account and not the address. `address` is the coarse backstop
    // underneath it — one host may not spray a hundred attempts a minute
    // across many accounts — and it is set high enough that a whole school
    // arriving through one proxy never reaches it.
    ThrottlerModule.forRoot([
      { name: 'auth', ttl: 60_000, limit: 10, getTracker: (req) => attemptSubject(req) },
      { name: 'address', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    EmailModule,
    SettingsModule,
    AuditModule,
    AuthModule,
    StudentsModule,
    AdminModule,
    SchoolModule,
    ContentModule,
    QuestionsModule,
    LearningModule,
    TeachersModule,
    ProgressModule,
    MessagesModule,
    HealthModule,
  ],
  providers: [
    // Registered globally and in this order, so every endpoint is protected
    // unless it opts out. Authentication runs first, then the role check
    // (SRS 37, ARCHITECTURE 9.1).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
