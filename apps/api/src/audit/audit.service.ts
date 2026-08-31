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
  PASSWORD_CHANGED: 'auth.password_changed',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  STUDENT_CREATED: 'student.created',
  STUDENT_UPDATED: 'student.updated',
  STUDENT_DISABLED: 'student.disabled',
  STUDENT_ENABLED: 'student.enabled',
  STUDENT_DELETED: 'student.deleted',
  STUDENT_RESTORED: 'student.restored',
  STUDENT_PASSWORD_RESET: 'student.password_reset',
  CONTENT_CREATED: 'content.created',
  CONTENT_UPDATED: 'content.updated',
  CONTENT_DELETED: 'content.deleted',
  CONTENT_PUBLISHED: 'content.published',
  CONTENT_UNPUBLISHED: 'content.unpublished',
  MESSAGE_SENT: 'message.sent',
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
    const data = {
      action: entry.action,
      schoolId: entry.schoolId ?? null,
      actorUserId: entry.actorUserId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata,
    };

    try {
      // Entries belonging to a school are written inside that school's scope.
      if (entry.schoolId) {
        await this.prisma.forSchool(entry.schoolId, (tx) => tx.auditLog.create({ data }));
        return;
      }

      // Entries without a school — a sign-out, or a failed sign-in for an
      // unknown username — belong to nobody, and the policy allows exactly
      // that: school_id IS NULL with no school set.
      //
      // It has to be written as plain SQL. Prisma always appends RETURNING,
      // and PostgreSQL makes a returned row pass the table's read rule as
      // well as its write rule. That read rule is `school_id =
      // current_school_id()`, which for two NULLs is NULL rather than true —
      // so every school-less entry was refused and quietly dropped, sign-outs
      // included. Nothing here reads the row back, so nothing is lost by not
      // asking for it.
      await this.prisma.$executeRaw`
        INSERT INTO audit_log (id, action, school_id, actor_user_id, target_type, target_id, metadata, created_at)
        VALUES (gen_random_uuid(), ${data.action}, NULL, ${data.actorUserId}::uuid,
                ${data.targetType}, ${data.targetId}::uuid, ${(data.metadata ?? null) as Prisma.InputJsonValue}, now())
      `;
    } catch (error) {
      this.logger.error(`Could not write audit entry "${entry.action}"`, error as Error);
    }
  }
}
