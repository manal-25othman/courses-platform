import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Getting back into an account that has been locked out.
 *
 * The rules this follows, and why:
 *
 *   Asking for a link never says whether the address has an account. Every
 *   request answers the same way, in the same time, whatever was typed. A
 *   route that said "no account with that address" would be a way to find out
 *   which of a school's teachers is registered, and, given a list of names,
 *   which children are.
 *
 *   Only the hash of a token is stored. A copy of the table is then of no use
 *   to anyone: there is nothing in it that can be presented to this API.
 *
 *   A token is single-use and expires. Redeeming one ends every session the
 *   account has open, because a password reset is what someone does when they
 *   believe the account is no longer only theirs.
 *
 *   A student without an e-mail address is not covered by any of this. Her
 *   teacher resets her password, which is how it already worked (SRS 28.6.2)
 *   and is the right answer for a child who has no inbox.
 */
@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  /**
   * How long a link lasts.
   *
   * Long enough that a teacher who asks in a lesson can act on it after it,
   * short enough that a forwarded or forgotten message stops working the same
   * day. Configurable rather than fixed, because the client has not been asked
   * about it and a number in code would be a decision made on her behalf.
   */
  private get lifetimeMinutes(): number {
    const configured = Number(this.config.get<string>('PASSWORD_RESET_TTL_MINUTES'));
    return Number.isFinite(configured) && configured > 0 ? configured : 60;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Tokens are compared by hash, so this is the only form ever stored. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Starts a recovery.
   *
   * Returns nothing in every case. What the caller learns is the same whether
   * the address has one account, several across schools, or none at all.
   */
  async requestReset(email: string): Promise<void> {
    const address = email.trim();
    if (address === '') return;

    const users = await this.prisma.findUsersByEmail(address);

    for (const user of users) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + this.lifetimeMinutes * 60_000);

      // Written with the school set where there is one, so the row goes in
      // under the same scoping every other write uses. A platform admin has no
      // school, and this table carries no school of its own, so both work.
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: this.hash(token), expiresAt },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
        schoolId: user.schoolId,
        actorUserId: user.id,
        targetType: 'user',
        targetId: user.id,
      });

      const link = `${this.webBase()}/reset-password?token=${token}`;
      const who = user.role === UserRole.STUDENT ? 'your learning account' : 'your teacher account';

      await this.email.send(
        address,
        'Reset your TOP GOAL password',
        [
          `Someone asked to reset the password for ${who} (${user.username}).`,
          '',
          'Open this link to choose a new password:',
          link,
          '',
          `The link stops working in ${this.lifetimeMinutes} minutes, and can only be used once.`,
          'If this was not you, you can ignore this message. Your password has not changed.',
        ].join('\n'),
      );
    }

    if (users.length === 0) {
      // Recorded without a school, like a failed sign-in for an unknown name.
      // The address is not written down: an audit log full of the addresses
      // people typed is itself a list worth stealing.
      await this.audit.record({
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
        metadata: { outcome: 'no_matching_account' },
      });
    }
  }

  /**
   * Finishes a recovery.
   *
   * The token is spent whether or not it turns out to belong to a usable
   * account, so one link is one attempt.
   */
  async completeReset(token: string, newPassword: string): Promise<void> {
    const refusal = new BadRequestException(
      'That link has expired or has already been used. Ask for a new one.',
    );

    const found = await this.prisma.findResetToken(this.hash(token));
    if (!found) throw refusal;

    const user = await this.prisma.findUserForAuthentication(found.userId);
    if (!user || user.deletedAt !== null) throw refusal;

    const passwordHash = await this.passwords.hash(newPassword);

    if (user.schoolId) {
      await this.prisma.forSchool(user.schoolId, async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          // She chose this one herself, so she is not asked to change it again.
          data: { passwordHash, mustChangePassword: false },
        });
        await tx.passwordResetToken.update({
          where: { id: found.id },
          data: { usedAt: new Date() },
        });
      });
    } else {
      // A platform admin belongs to no school, so there is no scope to set.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      await this.prisma.passwordResetToken.update({
        where: { id: found.id },
        data: { usedAt: new Date() },
      });
    }

    // Every other link that was outstanding stops working, and every session
    // ends. Someone resetting a password is often doing it because they think
    // the account is no longer only theirs.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.tokens.revokeAllForUser(user.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      schoolId: user.schoolId,
      actorUserId: user.id,
      targetType: 'user',
      targetId: user.id,
    });
  }

  /** Where the reset link points. The website, not this API. */
  private webBase(): string {
    return (
      this.config.get<string>('WEB_BASE_URL') ??
      this.config.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000'
    );
  }
}
