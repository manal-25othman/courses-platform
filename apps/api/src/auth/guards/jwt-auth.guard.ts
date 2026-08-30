import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessTokenPayload, CurrentUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Requires a valid access token on every endpoint.
 *
 * Registered globally, so protection is the default and an endpoint has to opt
 * out with @Public() rather than opt in. A new endpoint that nobody remembered
 * to protect is therefore closed, not open (SRS 37, ARCHITECTURE 9.2).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUser }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Sign in to continue.');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    request.user = { ...payload, userId: payload.sub };
    return true;
  }

  /** Accepts the header a mobile app sends, or the cookie the website sends. */
  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;

    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.access_token ?? null;
  }
}
