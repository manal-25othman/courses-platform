import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccessTokenPayload } from '../auth.types';
import type { AccountStateService } from '../account-state.service';

/**
 * An account the platform still accepts. The guard asks this on every request
 * now, so every existing test needs one; the tests at the foot of this file
 * are about what happens when the answer is no.
 */
const usable = { isUsable: async () => true } as unknown as AccountStateService;
const notUsable = { isUsable: async () => false } as unknown as AccountStateService;

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
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(true), usable);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('refuses a protected endpoint with no token', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), usable);

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a tampered token', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), usable);
    const request: FakeRequest = { headers: { authorization: 'Bearer tampered' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // A mobile app sends a header; it has no cookie jar (SRS 43).
  it('accepts a token from the Authorization header', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), usable);
    const request: FakeRequest = { headers: { authorization: 'Bearer good' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ ...payload, userId: 'user-1' });
  });

  // The website sends an httpOnly cookie, which its JavaScript cannot read.
  it('accepts a token from the cookie', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), usable);
    const request: FakeRequest = { headers: {}, cookies: { access_token: 'good' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ ...payload, userId: 'user-1' });
  });

  it('takes the school from the token, not from anything the client sends', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), usable);
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


/**
 * A signature proves who somebody was when the token was minted, not whether
 * they may still act. An access token lives fifteen minutes; deactivating a
 * teacher or suspending a school has to bite before that, or a suspension is
 * really a suspension-in-a-quarter-of-an-hour. These were both true until a
 * QA run caught them.
 */
describe('a genuine token is not enough on its own', () => {
  it('refuses a deactivated account holding a valid token', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), notUsable);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer good' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a cookie session whose school has been suspended', async () => {
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), notUsable);

    await expect(
      guard.canActivate(contextFor({ headers: {}, cookies: { access_token: 'good' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('says the same thing either way', async () => {
    // Naming the reason would tell whoever holds a stolen token something
    // about the organisation. The person it happens to is told properly by
    // the sign-in screen, which knows who she is.
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), notUsable);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer good' } })),
    ).rejects.toThrow(/session has ended/i);
  });

  it('still asks nothing of a public endpoint', async () => {
    // A closed school must not break the sign-in page it needs to come back.
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(true), notUsable);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('asks about the account named by the token, not by the caller', async () => {
    const asked: string[] = [];
    const spy = {
      isUsable: async (id: string) => {
        asked.push(id);
        return true;
      },
    } as unknown as AccountStateService;
    const guard = new JwtAuthGuard(jwtAccepting('good'), reflectorFor(false), spy);

    await guard.canActivate(contextFor({ headers: { authorization: 'Bearer good' } }));

    expect(asked).toEqual(['user-1']);
  });
});
