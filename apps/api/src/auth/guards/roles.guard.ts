import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Checks the caller's role against the roles an endpoint declares.
 *
 * An endpoint that declares no roles and is not public is refused. That is
 * deliberate: it makes an undeclared endpoint fail loudly during development
 * instead of quietly allowing every signed-in user (ARCHITECTURE 9.2).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const allowedRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles || allowedRoles.length === 0) {
      throw new ForbiddenException(
        'This endpoint declares no permitted roles. Add @Roles(...) or @Public().',
      );
    }

    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();
    const user = request.user;

    if (!user || !allowedRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to do this.');
    }

    return true;
  }
}
