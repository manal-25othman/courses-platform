import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limits repeated sign-in attempts.
 *
 * Without this, a password can be guessed as fast as the network allows
 * (ARCHITECTURE 8.4, 29.2). Applied to the sign-in and password endpoints
 * only, so ordinary use of the app is never throttled.
 */
@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {}

/**
 * Who an attempt is against, rather than where it came from.
 *
 * An address is the obvious thing to count, and for a long time it was the
 * only thing this counted. It stops being reliable the moment something sits
 * in front of the API — and something always does. Behind the website's
 * same-origin proxy every girl in the school arrives from one address, so an
 * address-counted limit of ten a minute is ten for the whole school: a class
 * signing in together locks itself out, and the eleventh girl is told to wait
 * for something she did not do. The hop count in common/trusted-proxy.ts
 * recovers the real address when the number of hops is right, and that number
 * is a property of the hosting, not of the code — it changes when a proxy is
 * added, silently, and the limit is wrong until somebody measures it.
 *
 * The account is steadier than the route to it. Guessing a password means
 * guessing one girl's password, and ten attempts a minute against her account
 * is the limit that was wanted; it holds whether the attempts arrive from one
 * address or a thousand, and it cannot be moved by a header. Her classmate
 * signing in at the same moment is a different account and is not affected.
 *
 * Where there is no account to name — a reset token being guessed — the
 * address is still the only subject available, and it is used. That one is
 * shared behind a proxy, which for a rare operation is the safe direction to
 * be wrong in.
 */
export function attemptSubject(request: Record<string, unknown>): string {
  const body = (request.body ?? {}) as Record<string, unknown>;

  // Guards run before validation, so this is whatever was sent. It is only
  // ever used as a key, and it is hashed before it is stored.
  for (const field of ['username', 'email']) {
    const value = body[field];
    if (typeof value === 'string' && value.trim() !== '') {
      // Lower-cased so two spellings of one account share one allowance, and
      // the school is deliberately not part of this: it is optional on the way
      // in, and a key that changes with an optional field is one an attacker
      // can double by leaving it out.
      return `account:${value.trim().toLowerCase().slice(0, 200)}`;
    }
  }

  const user = request.user as { id?: unknown } | undefined;
  if (typeof user?.id === 'string') return `user:${user.id}`;

  return `address:${String(request.ip)}`;
}

/**
 * Who the coarse backstop counts against.
 *
 * The backstop underneath the per-account limit asks a different question:
 * not "is somebody guessing this girl's password" but "is one caller working
 * through many accounts". It has always counted the caller's address, and an
 * address is exactly what stops being personal once something sits in front of
 * the API. Behind the website's proxy, Render sees the proxy for everybody, so
 * the backstop's budget is shared by the whole school -- and a girl can be
 * refused for attempts that were not hers.
 *
 * Two changes, and neither invents trust:
 *
 *   - Where the request is already authenticated -- changing her own password
 *     is the case that matters -- it is counted against her account. She has
 *     proved who she is, so there is no reason to charge her to an address she
 *     shares with her class.
 *
 *   - Where it is not, the address Express worked out under the configured hop
 *     count is used, and nothing else. `X-Forwarded-For` is never read here:
 *     the whole point of the hop count in common/trusted-proxy.ts is that only
 *     the proxies actually in front of the API may speak, and reading the
 *     header directly would hand any caller a fresh identity per request.
 *
 * The residual case is honest and unresolved in code: two unauthenticated
 * callers arriving through the same proxy still share this budget, because
 * from inside the API they are the same address. That is fixed by recovering
 * the real client address -- a hop-count change -- and that is only safe once
 * the API cannot be reached except through the proxy. Until then the
 * per-account limit above is what protects an individual girl, and it does:
 * her ten a minute are hers, whatever anybody else is doing.
 */
export function addressSubject(request: Record<string, unknown>): string {
  const user = request.user as { id?: unknown } | undefined;
  if (typeof user?.id === 'string') return `user:${user.id}`;

  return `address:${String(request.ip)}`;
}
