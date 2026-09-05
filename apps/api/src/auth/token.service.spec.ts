import { describe, expect, it, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { User, UserRole, UserStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import type { PrismaService } from '../prisma/prisma.service';

const USER: User = {
  id: 'user-1',
  schoolId: 'school-1',
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
} as User;

describe('TokenService.rotate', () => {
  let revokedFamilies: string[];
  let service: TokenService;

  beforeEach(() => {
    revokedFamilies = [];

    const jwt = {
      verifyAsync: async () => ({ sub: USER.id, familyId: 'family-1', jti: 'jti-1' }),
      signAsync: async () => 'signed',
    } as unknown as JwtService;

    const config = { get: () => undefined } as unknown as ConfigService;

    const prisma = {
      refreshToken: {
        findUnique: async () => ({
          id: 'row-1',
          userId: USER.id,
          familyId: 'family-1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          deviceLabel: null,
        }),
        update: async () => ({}),
        updateMany: async ({ where }: { where: { familyId?: string } }) => {
          if (where.familyId) revokedFamilies.push(where.familyId);
          return { count: 1 };
        },
        create: async () => ({}),
      },
      findUserForAuthentication: async () => USER,
      schoolIsActive: async () => true,

      // The policy-bound client stands in for what production enforces. A
      // renewal happens before any school is established, so `users` read this
      // way answers with nothing however valid the token is — and the code
      // that reads nothing treats it as a stolen token and ends the session.
      // Reaching for it here is the bug, so the fake refuses rather than
      // returning null and letting the test pass for the wrong reason.
      user: {
        findUnique: () => {
          throw new Error(
            'rotate() read `users` through the policy-bound client. Under row-level ' +
              'security that returns nothing, and every session is revoked fifteen ' +
              'minutes in. Use prisma.findUserForAuthentication instead.',
          );
        },
      },
    } as unknown as PrismaService;

    service = new TokenService(jwt, config, prisma);
  });

  it('renews a valid session without touching the policy-bound client', async () => {
    const { pair, user } = await service.rotate('a-refresh-token');

    expect(user.id).toBe(USER.id);
    expect(pair.accessToken).toBe('signed');
    expect(revokedFamilies).toEqual([]);
  });

  it('still ends the family when the account is no longer active', async () => {
    const prisma = {
      refreshToken: {
        findUnique: async () => ({
          id: 'row-1',
          userId: USER.id,
          familyId: 'family-1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          deviceLabel: null,
        }),
        update: async () => ({}),
        updateMany: async ({ where }: { where: { familyId?: string } }) => {
          if (where.familyId) revokedFamilies.push(where.familyId);
          return { count: 1 };
        },
      },
      findUserForAuthentication: async () => ({ ...USER, status: UserStatus.DISABLED }),
      schoolIsActive: async () => true,
    } as unknown as PrismaService;

    const jwt = {
      verifyAsync: async () => ({ sub: USER.id, familyId: 'family-1', jti: 'jti-1' }),
    } as unknown as JwtService;

    const suspended = new TokenService(jwt, { get: () => undefined } as unknown as ConfigService, prisma);

    await expect(suspended.rotate('a-refresh-token')).rejects.toThrow(UnauthorizedException);
    expect(revokedFamilies).toEqual(['family-1']);
  });
});
