import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The single database connection for the API.
 *
 * Later phases add tenant scoping here, so that every query is automatically
 * restricted to the caller's school and no individual query has to remember
 * (ARCHITECTURE 4.2, 12).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
