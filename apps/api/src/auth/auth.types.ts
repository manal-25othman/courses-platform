import { UserRole } from '@prisma/client';

/**
 * What a valid access token proves about its bearer.
 *
 * The school is taken from here and never from the request body or query, so a
 * caller cannot ask for another school's data by claiming to belong to it
 * (ARCHITECTURE 12, barrier 1).
 */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  role: UserRole;
  /** Null only for a platform admin. */
  schoolId: string | null;
  /** True while a teacher-issued temporary password is still in use. */
  mustChangePassword: boolean;
}

/** The caller, as attached to every authenticated request. */
export interface CurrentUser extends AccessTokenPayload {
  userId: string;
}

/** What a refresh token carries. */
export interface RefreshTokenPayload {
  sub: string;
  /** Identifies the chain of tokens started by one login. */
  familyId: string;
  /** Unique per token, so a specific token can be recognised and revoked. */
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
