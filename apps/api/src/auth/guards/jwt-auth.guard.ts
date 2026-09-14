import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessTokenPayload, CurrentUser } from '../auth.types';
import { AccountStateService } from '../account-state.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Requires a valid access token on every endpoint.
 *
 * Registered globally, so protection is the default and an endpoint has to opt
 * out with @Public() rather than opt in. A new endpoint that nobody remembered
 * to protect is therefore closed, not open (SRS 37, ARCHITECTURE 9.2).
 *
 * A valid signature is necessary and not sufficient. The token says who
 * somebody was when it was issued; it cannot say whether their account has
 * since been deactivated or their school suspended, and a token stays valid
 * for fifteen minutes. So the account is checked too, on every request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly accounts: AccountStateService,
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

    /*
      The token is genuine. Is the account still one that may act?

      Same sentence for both cases on purpose. "Your school has been
      suspended" would tell whoever holds a stolen token something about the
      organisation; the person it actually happens to is told properly by the
      sign-in screen, which knows who she is.
    */
    if (!(await this.accounts.isUsable(payload.sub))) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
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
