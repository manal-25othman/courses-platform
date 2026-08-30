import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { AuthService, AuthenticatedUserView } from './auth.service';
import { TokenService } from './token.service';
import { TokenPair, CurrentUser as CurrentUserType } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Tokens go back two ways on purpose: in httpOnly cookies, which the website
   * uses and JavaScript cannot read, and in the response body, which a future
   * mobile app needs because it has no cookie jar (SRS 43, ARCHITECTURE 8.2).
   */
  private setCookies(response: Response, pair: TokenPair): void {
    const secure = this.config.get<string>('NODE_ENV') === 'production';
    const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };

    response.cookie(ACCESS_COOKIE, pair.accessToken, base);
    response.cookie(REFRESH_COOKIE, pair.refreshToken, base);
  }

  private clearCookies(response: Response): void {
    response.clearCookie(ACCESS_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  private readRefreshToken(request: Request, dto: RefreshDto): string | null {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_COOKIE] ?? dto.refreshToken ?? null;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUserView } & TokenPair> {
    const deviceLabel = request.headers['user-agent']?.slice(0, 200);
    const { pair, user } = await this.auth.login(dto, deviceLabel);

    this.setCookies(response, pair);

    return { user: await this.auth.describe(user.id), ...pair };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPair> {
    const presented = this.readRefreshToken(request, dto);

    if (!presented) {
      this.clearCookies(response);
      throw new UnauthorizedException('Sign in to continue.');
    }

    const { pair, user } = await this.tokens.rotate(presented);

    this.setCookies(response, pair);
    await this.audit.record({
      action: AUDIT_ACTIONS.TOKEN_REFRESHED,
      schoolId: user.schoolId,
      actorUserId: user.id,
    });

    return pair;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = this.readRefreshToken(request, dto);

    if (presented) {
      await this.tokens.revokeByToken(presented);
      await this.audit.record({ action: AUDIT_ACTIONS.LOGOUT });
    }

    // Always clear, so a client with a stale cookie ends up signed out either way.
    this.clearCookies(response);
  }

  /**
   * Changes the caller's own password.
   *
   * Every role may change their own. Because all sessions end, the client has
   * to sign in again afterwards with the new password.
   */
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.userId, dto);
    this.clearCookies(response);
  }

  /** The caller's own details. Every role may ask about themselves. */
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @Get('me')
  async me(@CurrentUser() user: CurrentUserType): Promise<AuthenticatedUserView> {
    return this.auth.describe(user.userId);
  }
}
