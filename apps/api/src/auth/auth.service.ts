import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { TokenPair } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/** What the caller is told about themselves after signing in. */
export interface AuthenticatedUserView {
  id: string;
  username: string;
  role: User['role'];
  schoolId: string | null;
  displayName: string;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Checks a username and password and starts a session.
   *
   * Every failure returns the same message. Telling a caller that a username
   * exists but the password was wrong would let anyone discover which
   * usernames are real (SRS 37).
   */
  async login(dto: LoginDto, deviceLabel?: string): Promise<{ pair: TokenPair; user: User }> {
    // Usernames are unique within a school, not across all of them. Look the
    // name up and use the match when there is exactly one; if two schools
    // happen to use the same username, the client must say which school.
    const candidates = await this.prisma.user.findMany({
      where: {
        username: dto.username,
        ...(dto.schoolId ? { schoolId: dto.schoolId } : {}),
      },
      take: 2,
    });

    const user = candidates.length === 1 ? candidates[0] : null;

    const failure = new UnauthorizedException('Incorrect username or password.');

    if (!user) {
      // Hash anyway, so a missing username does not answer faster than a wrong
      // password and reveal which usernames exist by timing alone.
      await this.passwords.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
        dto.password,
      );
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        schoolId: dto.schoolId ?? null,
        metadata: {
          username: dto.username,
          reason: candidates.length > 1 ? 'ambiguous_username' : 'unknown_user',
        },
      });
      throw failure;
    }

    const passwordMatches = await this.passwords.verify(user.passwordHash, dto.password);

    if (!passwordMatches) {
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        schoolId: user.schoolId,
        actorUserId: user.id,
        metadata: { reason: 'wrong_password' },
      });
      throw failure;
    }

    // A deleted account is hidden and cannot sign in, but its data is kept and
    // it can be restored (SRS 27.1). A disabled one is blocked but visible.
    if (user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        schoolId: user.schoolId,
        actorUserId: user.id,
        metadata: { reason: user.deletedAt !== null ? 'deleted' : 'disabled' },
      });
      throw failure;
    }

    const pair = await this.tokens.issuePair(user, deviceLabel);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      schoolId: user.schoolId,
      actorUserId: user.id,
    });

    return { pair, user };
  }

  /**
   * Replaces the caller's own password.
   *
   * This is what clears the temporary password a teacher issued (SRS 28.6.2).
   * Every other session ends, so a password change also signs out any device
   * that was using the old one.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid session.');
    }

    const matches = await this.passwords.verify(user.passwordHash, dto.currentPassword);

    if (!matches) {
      throw new UnauthorizedException('Your current password is not correct.');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Your new password must be different from the current one.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        mustChangePassword: false,
      },
    });

    await this.tokens.revokeAllForUser(user.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      schoolId: user.schoolId,
      actorUserId: user.id,
    });
  }

  /** The caller's own details, for "who am I". */
  async describe(userId: string): Promise<AuthenticatedUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teacherProfile: true, studentProfile: true },
    });

    if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid session.');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      schoolId: user.schoolId,
      // The teacher's name comes from her profile, never from a literal in the
      // interface, so changing it updates everywhere it appears (SRS 33).
      displayName:
        user.teacherProfile?.displayName ?? user.studentProfile?.fullName ?? user.username,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
