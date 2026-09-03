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
    // Signing in cannot be scoped to a school, because the school is what is
    // being established. This goes through a database function that answers
    // only this one question rather than around the policies generally.
    const candidates = await this.prisma.findUsersForAuthentication(dto.username, dto.schoolId);

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

    // Her own account is in order; her school also has to be open. Closing a
    // school used to change nothing at all — the status was recorded and never
    // read — so a school could be marked disabled while everybody in it
    // carried on working. The same generic failure is returned as for a wrong
    // password: whether a school is open is not something to confirm to
    // somebody who cannot get in.
    if (!(await this.prisma.schoolIsActive(user.schoolId))) {
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        schoolId: user.schoolId,
        actorUserId: user.id,
        metadata: { reason: 'school_disabled' },
      });
      throw failure;
    }

    const pair = await this.tokens.issuePair(user, deviceLabel);

    if (user.schoolId) {
      await this.prisma.forSchool(user.schoolId, (tx) =>
        tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      );
    }

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
    const user = await this.prisma.findUserForAuthentication(userId);

    if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid session.');
    }

    // A closed school is closed for this too, or somebody holding a valid
    // token could still be setting passwords inside it.
    if (!(await this.prisma.schoolIsActive(user.schoolId))) {
      throw new UnauthorizedException('Invalid session.');
    }

    const matches = await this.passwords.verify(user.passwordHash, dto.currentPassword);

    if (!matches) {
      throw new UnauthorizedException('Your current password is not correct.');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Your new password must be different from the current one.');
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);

    if (user.schoolId) {
      await this.prisma.forSchool(user.schoolId, (tx) =>
        tx.user.update({
          where: { id: user.id },
          data: { passwordHash, mustChangePassword: false },
        }),
      );
    }

    await this.tokens.revokeAllForUser(user.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      schoolId: user.schoolId,
      actorUserId: user.id,
    });
  }

  /** The caller's own details, for "who am I". */
  async describe(userId: string): Promise<AuthenticatedUserView> {
    const account = await this.prisma.findUserForAuthentication(userId);

    if (!account || account.deletedAt !== null || account.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid session.');
    }

    // Checked here too, which is what makes a closed school take effect on
    // the website within one page load rather than within one token lifetime:
    // every screen asks who it is talking to before it draws anything.
    if (!(await this.prisma.schoolIsActive(account.schoolId))) {
      throw new UnauthorizedException('Invalid session.');
    }

    // The display name lives on the profile, which is tenant-scoped like every
    // other row, so it is read inside the caller's own school.
    const user = account.schoolId
      ? ((await this.prisma.forSchool(account.schoolId, (tx) =>
          tx.user.findUnique({
            where: { id: userId },
            include: { teacherProfile: true, studentProfile: true },
          }),
        )) ?? { ...account, teacherProfile: null, studentProfile: null })
      : { ...account, teacherProfile: null, studentProfile: null };

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
