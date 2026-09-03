import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload, RefreshTokenPayload, TokenPair } from './auth.types';

/**
 * Issues, rotates and revokes tokens.
 *
 * Tokens rather than server-side sessions, because the same mechanism has to
 * serve the website and a future mobile app without being rebuilt (SRS 43).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Refresh tokens are stored hashed, so a database leak yields no sessions. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Lifetimes come from the environment so they can be tuned per deployment.
   *
   * The cast is needed because the signing library types this as a template
   * literal (for example `15m`), which a value read from the environment
   * cannot be proven to match at compile time. It is validated at runtime by
   * the library when a token is signed.
   */
  private get accessTtl(): JwtSignOptions['expiresIn'] {
    return (this.config.get<string>('ACCESS_TOKEN_TTL') ??
      '15m') as JwtSignOptions['expiresIn'];
  }

  private get refreshTtlDays(): number {
    const configured = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? '30');
    return Number.isFinite(configured) && configured > 0 ? configured : 30;
  }

  /** Starts a new token family. Called on login. */
  async issuePair(user: User, deviceLabel?: string): Promise<TokenPair> {
    return this.mint(user, randomUUID(), deviceLabel);
  }

  private async mint(user: User, familyId: string, deviceLabel?: string): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      mustChangePassword: user.mustChangePassword,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, { expiresIn: this.accessTtl });

    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: user.id, familyId, jti };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      expiresIn: `${this.refreshTtlDays}d` as JwtSignOptions['expiresIn'],
    });

    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        deviceLabel: deviceLabel ?? null,
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * A token that has already been used, or one that was revoked, means the
   * token was probably stolen — so the whole family is revoked and the caller
   * is rejected, rather than quietly issuing a fresh session.
   */
  async rotate(presentedToken: string): Promise<{ pair: TokenPair; user: User }> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(presentedToken);
    } catch {
      throw new UnauthorizedException('Invalid session.');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(presentedToken) },
    });

    if (!stored) {
      // Signed correctly but unknown to us: already rotated away, or forged.
      await this.revokeFamily(payload.familyId);
      throw new UnauthorizedException('Invalid session.');
    }

    if (stored.revokedAt !== null || stored.expiresAt <= new Date()) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });

    if (!user || user.deletedAt !== null || user.status !== 'ACTIVE') {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Invalid session.');
    }

    // Renewing is where a closed school stops a session that was already
    // running. The family is revoked as well, so the refusal is permanent
    // rather than something to retry until the school is reopened.
    if (!(await this.prisma.schoolIsActive(user.schoolId))) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Invalid session.');
    }

    // Consume the presented token before issuing its replacement.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const pair = await this.mint(user, stored.familyId, stored.deviceLabel ?? undefined);
    return { pair, user };
  }

  /** Ends one session. Used by logout. */
  async revokeByToken(presentedToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(presentedToken) },
    });

    if (stored) {
      await this.revokeFamily(stored.familyId);
    }
  }

  /** Ends every session in a chain. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session a user has, on every device. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
