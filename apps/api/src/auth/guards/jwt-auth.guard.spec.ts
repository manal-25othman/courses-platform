import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccessTokenPayload } from '../auth.types';

interface FakeRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  user?: unknown;
}

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function reflectorFor(isPublic?: boolean): Reflector {
  return {
    getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? isPublic : undefined),
  } as unknown as Reflector;
}

const payload: AccessTokenPayload = {
  sub: 'user-1',
  role: UserRole.TEACHER,
  schoolId: 'school-1',
  mustChangePassword: false,
};

/** A verifier that accepts exactly one token value. */
function jwtAccepting(valid: string): JwtService {
  return {
    verifyAsync: async (token: string) => {
      if (token !== valid) throw new Error('bad token');
      return payload;
    },
  } as unknown as JwtService;
}

describe('JwtAuthGuard', () => {
  it('lets a public endpoint through with no token at all', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(true));

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('refuses a protected endpoint with no token', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false));

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a tampered token', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false));
    const request: FakeRequest = { headers: { authorization: 'Bearer tampered' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // A mobile app sends a header; it has no cookie jar (SRS 43).
  it('accepts a token from the Authorization header', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false));
    const request: FakeRequest = { headers: { authorization: 'Bearer good' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ ...payload, userId: 'user-1' });
  });

  // The website sends an httpOnly cookie, which its JavaScript cannot read.
  it('accepts a token from the cookie', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false));
    const request: FakeRequest = { headers: {}, cookies: { access_token: 'good' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ ...payload, userId: 'user-1' });
  });

  it('takes the school from the token, not from anything the client sends', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false));
    const request: FakeRequest = {
      headers: { authorization: 'Bearer good' },
      // A caller trying to claim another school by other means gets nowhere:
      // only the verified token is read.
      cookies: { school_id: 'someone-elses-school' },
    };

    await guard.canActivate(contextFor(request));

    expect((request.user as AccessTokenPayload).schoolId).toBe('school-1');
  });
});
