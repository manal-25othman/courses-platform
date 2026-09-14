import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Whether an account may still be used, right now.
 *
 * Signing in asked this. Renewing a session asked this. Changing a password
 * asked this. Every request in between did not — it checked the access
 * token's signature and nothing else — so deactivating a teacher or suspending
 * a school left the people already signed in working normally until their
 * token expired. Fifteen minutes is a long time to keep serving a school that
 * has been suspended, and a suspension that does not take effect until later
 * is not really a suspension.
 *
 * So the same question is now asked on every authenticated request, by the
 * guard, through this one service — one rule in one place rather than a second
 * copy of it that could drift from the first.
 *
 * It costs a primary-key lookup, and a second small query for anyone who
 * belongs to a school. Both go through the same database functions the sign-in
 * path uses, which answer without a tenant scope — necessarily, since the
 * scope is what this is deciding.
 */
@Injectable()
export class AccountStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * True when this account may act.
   *
   * Deliberately the same four conditions the refresh path applies, and in the
   * same order: the account exists, has not been deleted, is active, and its
   * school is open. The platform operator belongs to no school, so closing one
   * never locks out the person who has to reopen it.
   */
  async isUsable(userId: string): Promise<boolean> {
    const user = await this.prisma.findUserForAuthentication(userId);

    if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      return false;
    }

    return this.prisma.schoolIsActive(user.schoolId);
  }
}
