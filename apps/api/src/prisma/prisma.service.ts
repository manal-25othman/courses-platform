import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient, User } from '@prisma/client';

/**
 * A database handle already confined to one school.
 *
 * Everything inside {@link PrismaService.forSchool} receives this instead of
 * the plain client, as a reminder that it is running inside a scoped
 * transaction.
 */
export type TenantClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * The single database connection for the API.
 *
 * The application connects as a restricted role that cannot see past the
 * row-level policies, so which school a query may touch is decided by the
 * database, not only by the code (ARCHITECTURE 4.1, 12).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.assertConnectionIsRestricted();
  }

  /**
   * Refuses to start on a database role that ignores row-level security.
   *
   * A superuser, or any role with BYPASSRLS, is exempt from every policy in
   * this database. Point the application at one and tenant isolation stops
   * existing — silently: no error, no warning, every school's data visible to
   * every request. It is an easy mistake to make, because the connection
   * string a hosting provider offers first is usually the owner's, and it is
   * the exact mistake that made the first version of the isolation work look
   * like it was working when it was not.
   *
   * So the check runs at startup and stops the process, rather than leaving a
   * running API with no protection. Setting ALLOW_UNRESTRICTED_DB=true skips
   * it, which is for a local database only and never for anything holding real
   * student data.
   */
  private async assertConnectionIsRestricted(): Promise<void> {
    const [row] = await this.$queryRaw<{ role: string; bypasses: boolean }[]>`
      SELECT rolname AS role, (rolsuper OR rolbypassrls) AS bypasses
      FROM pg_roles
      WHERE rolname = current_user
    `;

    if (!row?.bypasses) {
      this.logger.log(`Connected as "${row?.role}", which row-level security applies to.`);
      return;
    }

    if (process.env.ALLOW_UNRESTRICTED_DB === 'true') {
      this.logger.warn(
        `Connected as "${row.role}", which BYPASSES row-level security. ` +
          'Tenant isolation is NOT being enforced by the database. ' +
          'Allowed only because ALLOW_UNRESTRICTED_DB=true.',
      );
      return;
    }

    throw new Error(
      `Refusing to start: the database user "${row.role}" bypasses row-level security, ` +
        'so one school could read another\'s data. Point DATABASE_URL at the restricted ' +
        'role (app_user) instead of the owner. See .env.example.',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `work` with the current school fixed for the length of one
   * transaction.
   *
   * The setting is transaction-local, so it cannot leak to the next request
   * that reuses the same pooled connection. Outside this helper no school is
   * set, and the policies then match nothing — a forgotten scope returns an
   * empty result rather than another school's data.
   */
  async forSchool<T>(schoolId: string, work: (tx: TenantClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
      return work(tx);
    });
  }

  /**
   * Finds the accounts matching a username, before any school is known.
   *
   * Signing in cannot be tenant-scoped, because the school is exactly what is
   * being established. This calls a database function that answers only this
   * one question; it is not a general way around the policies.
   */
  async findUsersForAuthentication(username: string, schoolId?: string): Promise<User[]> {
    // Raw queries return database column names, not the field names Prisma
    // generates, so every column is aliased. Without this `passwordHash` would
    // arrive as undefined and every password check would silently fail.
    return this.$queryRaw<User[]>`
      SELECT
        id,
        school_id            AS "schoolId",
        role,
        username,
        email,
        password_hash        AS "passwordHash",
        must_change_password AS "mustChangePassword",
        status,
        deleted_at           AS "deletedAt",
        last_login_at        AS "lastLoginAt",
        created_at           AS "createdAt",
        updated_at           AS "updatedAt"
      FROM auth_find_users_by_username(${username}, ${schoolId ?? null}::uuid)
    `;
  }

  /**
   * Finds the accounts using an e-mail address, before any school is known.
   *
   * Recovery begins with an address and nothing else, so like signing in it
   * cannot be tenant-scoped. The function it calls answers only this question
   * and returns nothing for a disabled or deleted account.
   */
  async findUsersByEmail(email: string): Promise<User[]> {
    return this.$queryRaw<User[]>`
      SELECT
        id,
        school_id            AS "schoolId",
        role,
        username,
        email,
        password_hash        AS "passwordHash",
        must_change_password AS "mustChangePassword",
        status,
        deleted_at           AS "deletedAt",
        last_login_at        AS "lastLoginAt",
        created_at           AS "createdAt",
        updated_at           AS "updatedAt"
      FROM auth_find_users_by_email(${email})
    `;
  }

  /**
   * Finds a live reset token by its hash.
   *
   * Expired and already-used tokens return nothing, so those cases are
   * decided in the database rather than by a caller remembering to check.
   */
  async findResetToken(tokenHash: string): Promise<{ id: string; userId: string } | null> {
    const rows = await this.$queryRaw<{ id: string; userId: string }[]>`
      SELECT id, user_id AS "userId" FROM auth_find_reset_token(${tokenHash})
    `;
    return rows[0] ?? null;
  }

  /** Loads one account by id, for a caller who has already proved who they are. */
  async findUserForAuthentication(id: string): Promise<User | null> {
    const rows = await this.$queryRaw<User[]>`
      SELECT
        id,
        school_id            AS "schoolId",
        role,
        username,
        email,
        password_hash        AS "passwordHash",
        must_change_password AS "mustChangePassword",
        status,
        deleted_at           AS "deletedAt",
        last_login_at        AS "lastLoginAt",
        created_at           AS "createdAt",
        updated_at           AS "updatedAt"
      FROM auth_find_user_by_id(${id}::uuid)
    `;
    return rows[0] ?? null;
  }

  /**
   * Whether a school is open for business.
   *
   * Asked while somebody is signing in or renewing a session, which happens
   * before any school is established and so has no scope to read `schools`
   * under. Goes through a database function that answers only this, in the
   * same way the account lookups do.
   *
   * A user with no school — the platform operator — is never held up by this:
   * she belongs to no school, and closing one must not lock out the person who
   * has to reopen it.
   */
  async schoolIsActive(schoolId: string | null): Promise<boolean> {
    if (schoolId === null) return true;

    const rows = await this.$queryRaw<{ open: boolean }[]>`
      SELECT school_is_active(${schoolId}::uuid) AS open
    `;

    // A missing answer is treated as closed. If this cannot be established,
    // refusing the sign-in is the safe direction.
    return rows[0]?.open === true;
  }

  /** Escape hatch for raw work inside an existing scoped transaction. */
  static setSchool(tx: TenantClient, schoolId: string): Prisma.PrismaPromise<number> {
    return (tx as unknown as PrismaClient)
      .$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
  }
}
