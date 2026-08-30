import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GET /api/v1/health
 *
 * Used to confirm the API is running and can reach the database. Deliberately
 * exposes nothing about the data itself.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    let database = 'unreachable';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      // Swallow the detail on purpose: connection strings and driver errors
      // must never be returned to a caller.
      database = 'unreachable';
    }

    return {
      status: database === 'connected' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
