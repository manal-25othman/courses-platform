import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    // Reads .env once and makes it available everywhere.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
