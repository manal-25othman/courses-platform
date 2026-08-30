import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CurrentUser } from '../auth.types';

/** Builds a context carrying the given caller. */
function contextFor(user?: Partial<CurrentUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

/** A Reflector that answers with the given metadata. */
function reflectorFor(values: { isPublic?: boolean; roles?: UserRole[] }): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? values.isPublic : key === ROLES_KEY ? values.roles : undefined,
  } as unknown as Reflector;
}

const teacher: Partial<CurrentUser> = { role: UserRole.TEACHER };
const student: Partial<CurrentUser> = { role: UserRole.STUDENT };

describe('RolesGuard', () => {
  it('allows an endpoint marked public', () => {
    const guard = new RolesGuard(reflectorFor({ isPublic: true }));

    expect(guard.canActivate(contextFor())).toBe(true);
  });

  // This is the rule that makes forgetting to protect an endpoint safe.
  it('refuses an endpoint that declares no roles', () => {
    const guard = new RolesGuard(reflectorFor({}));

    expect(() => guard.canActivate(contextFor(teacher))).toThrow(ForbiddenException);
  });

  it('refuses an endpoint whose role list is empty', () => {
    const guard = new RolesGuard(reflectorFor({ roles: [] }));

    expect(() => guard.canActivate(contextFor(teacher))).toThrow(ForbiddenException);
  });

  it('allows a caller whose role is listed', () => {
    const guard = new RolesGuard(reflectorFor({ roles: [UserRole.TEACHER] }));

    expect(guard.canActivate(contextFor(teacher))).toBe(true);
  });

  it('refuses a student reaching a teacher-only endpoint', () => {
    const guard = new RolesGuard(reflectorFor({ roles: [UserRole.TEACHER] }));

    expect(() => guard.canActivate(contextFor(student))).toThrow(ForbiddenException);
  });

  it('refuses a teacher reaching an admin-only endpoint', () => {
    const guard = new RolesGuard(reflectorFor({ roles: [UserRole.ADMIN] }));

    expect(() => guard.canActivate(contextFor(teacher))).toThrow(ForbiddenException);
  });

  it('refuses a request with no caller attached', () => {
    const guard = new RolesGuard(reflectorFor({ roles: [UserRole.TEACHER] }));

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
