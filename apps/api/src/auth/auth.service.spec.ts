import { describe, expect, it, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { User, UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';

const SCHOOL = 'school-1';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    schoolId: SCHOOL,
    role: UserRole.STUDENT,
    username: 'sara',
    email: null,
    passwordHash: 'stored-hash',
    mustChangePassword: false,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

describe('AuthService.login', () => {
  let user: User | null;
  let audited: string[];
  let service: AuthService;

  /** Verifies only the exact password "right". */
  const passwords = {
    verify: async (_hash: string, plain: string) => plain === 'right',
    hash: async (p: string) => `hashed:${p}`,
  } as unknown as PasswordService;

  const tokens = {
    issuePair: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
  } as unknown as TokenService;

  beforeEach(() => {
    user = makeUser();
    audited = [];

    const prisma = {
      user: {
        findFirst: async () => user,
        update: async () => user,
      },
      school: { findMany: async () => [{ id: SCHOOL }] },
    } as unknown as PrismaService;

    const audit = {
      record: async (entry: { action: string }) => {
        audited.push(entry.action);
      },
    } as unknown as AuditService;

    service = new AuthService(prisma, passwords, tokens, audit);
  });

  it('signs in with the correct password', async () => {
    const result = await service.login({ username: 'sara', password: 'right' });

    expect(result.pair.accessToken).toBe('a');
    expect(audited).toContain('auth.login_succeeded');
  });

  it('refuses a wrong password', async () => {
    await expect(service.login({ username: 'sara', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(audited).toContain('auth.login_failed');
  });

  /**
   * The same message for both cases, so nobody can discover which usernames
   * exist by comparing responses (SRS 37).
   */
  it('gives the same message for a wrong password and an unknown username', async () => {
    const wrongPassword = await service.login({ username: 'sara', password: 'wrong' }).catch((e) => e);

    user = null;
    const unknownUser = await service.login({ username: 'nobody', password: 'wrong' }).catch((e) => e);

    expect(wrongPassword.message).toBe(unknownUser.message);
    expect(wrongPassword.getStatus()).toBe(unknownUser.getStatus());
  });

  // Disabled blocks sign-in but keeps her visible to the teacher (SRS 27.1).
  it('refuses a disabled account even with the right password', async () => {
    user = makeUser({ status: UserStatus.DISABLED });

    await expect(service.login({ username: 'sara', password: 'right' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // Deleted is a reversible hide: sign-in is blocked, data is kept (SRS 27.1).
  it('refuses a deleted account even with the right password', async () => {
    user = makeUser({ deletedAt: new Date() });

    await expect(service.login({ username: 'sara', password: 'right' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets a restored account sign in again', async () => {
    user = makeUser({ deletedAt: null });

    await expect(service.login({ username: 'sara', password: 'right' })).resolves.toBeDefined();
  });

  it('never reveals why a sign-in failed', async () => {
    user = makeUser({ status: UserStatus.DISABLED });
    const disabled = await service.login({ username: 'sara', password: 'right' }).catch((e) => e);

    user = makeUser();
    const wrongPassword = await service.login({ username: 'sara', password: 'wrong' }).catch((e) => e);

    expect(disabled.message).toBe(wrongPassword.message);
  });
});
