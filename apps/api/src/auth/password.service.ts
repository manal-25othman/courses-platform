import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hashes and checks passwords.
 *
 * Argon2id, as required by SRS 37. A plain password is never stored, never
 * logged and never returned by any endpoint.
 */
@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  /** Returns false rather than throwing when the stored hash is unreadable. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
