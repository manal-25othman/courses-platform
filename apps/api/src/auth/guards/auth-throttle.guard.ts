import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limits repeated sign-in attempts from one address.
 *
 * Without this, a password can be guessed as fast as the network allows
 * (ARCHITECTURE 8.4, 29.2). Applied to the sign-in and password endpoints
 * only, so ordinary use of the app is never throttled.
 */
@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {}
