import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { TokenPair } from './auth.types';
import { LoginDto } from './dto/login.dto';

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
    const schoolId = dto.schoolId ?? (await this.resolveSingleSchoolId());

    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, schoolId },
    });

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
        schoolId,
        metadata: { username: dto.username, reason: 'unknown_user' },
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
   * With one school, a student should not have to know a school id to sign in.
   * Once there is more than one, the client must say which.
   */
  private async resolveSingleSchoolId(): Promise<string | null> {
    const schools = await this.prisma.school.findMany({ take: 2, select: { id: true } });
    return schools.length === 1 ? schools[0].id : null;
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
