import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
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
    ThrottlerModule.forRoot([{ name: 'auth', ttl: 60_000, limit: 10 }]),
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
