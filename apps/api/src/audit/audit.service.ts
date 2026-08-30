import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The actions recorded so far. Adding one is adding a constant here. */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESHED: 'auth.token_refreshed',
  TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  schoolId?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Records sensitive actions (SRS 37, 28.6.3).
 *
 * Writing an audit entry must never break the action being audited, so a
 * failure here is logged and swallowed rather than thrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          schoolId: entry.schoolId ?? null,
          actorUserId: entry.actorUserId ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Could not write audit entry "${entry.action}"`, error as Error);
    }
  }
}
