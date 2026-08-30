import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Proves the database itself enforces tenant isolation.
 *
 * These run against a real PostgreSQL, because the thing being tested is the
 * database's behaviour, not the application's. They connect as the same
 * restricted role the running API uses.
 *
 *   APP_DATABASE_URL   - the restricted role (app_user)
 *   OWNER_DATABASE_URL - the owner, used only to set up the fixtures
 */
const APP_URL = process.env.APP_DATABASE_URL;
const OWNER_URL = process.env.OWNER_DATABASE_URL ?? process.env.DIRECT_URL;

const SCHOOL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCHOOL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const owner = new PrismaClient({ datasourceUrl: OWNER_URL });
const app = new PrismaClient({ datasourceUrl: APP_URL });

/** Runs work with the current school fixed for one transaction. */
async function forSchool<T>(schoolId: string, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
    return work(tx as unknown as PrismaClient);
  });
}

beforeAll(async () => {
  // Fixtures are created by the owner, which is not subject to the policies.
  for (const [id, name] of [
    [SCHOOL_A, 'Isolation Test A'],
    [SCHOOL_B, 'Isolation Test B'],
  ] as const) {
    await owner.school.upsert({ where: { id }, update: {}, create: { id, name } });
  }

  for (const [schoolId, username] of [
    [SCHOOL_A, 'iso-a-1'],
    [SCHOOL_A, 'iso-a-2'],
    [SCHOOL_B, 'iso-b-1'],
  ] as const) {
    const existing = await owner.user.findFirst({ where: { username, schoolId } });
    if (!existing) {
      await owner.user.create({
        data: { schoolId, username, role: 'STUDENT', passwordHash: 'x' },
      });
    }
  }
});

const TENANT_TABLES = [
  'users',
  'schools',
  'teacher_profiles',
  'student_profiles',
  'audit_log',
  'settings',
] as const;

afterAll(async () => {
  await owner.user.deleteMany({ where: { schoolId: { in: [SCHOOL_A, SCHOOL_B] } } });
  await owner.school.deleteMany({ where: { id: { in: [SCHOOL_A, SCHOOL_B] } } });

  // Safety net. The tests below deliberately try to switch the protection off,
  // expecting to be refused. If the setup is wrong and one of them succeeds,
  // the attempt would leave the database unprotected — so the protection is
  // put back unconditionally, whatever the tests did.
  for (const table of TENANT_TABLES) {
    await owner.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await owner.$executeRawUnsafe(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  }

  await owner.$disconnect();
  await app.$disconnect();
});

describe('the database enforces tenant isolation', () => {
  /**
   * The most important test here. A query that forgets to set a school must
   * return nothing, so a missed filter in future code is a visible empty
   * result rather than a silent leak of another school's students.
   */
  it('returns nothing when no school is set', async () => {
    const users = await app.user.findMany({ where: { username: { startsWith: 'iso-' } } });

    expect(users).toHaveLength(0);
  });

  it('shows a school only its own rows', async () => {
    const a = await forSchool(SCHOOL_A, (tx) =>
      tx.user.findMany({ where: { username: { startsWith: 'iso-' } } }),
    );
    const b = await forSchool(SCHOOL_B, (tx) =>
      tx.user.findMany({ where: { username: { startsWith: 'iso-' } } }),
    );

    expect(a.map((u) => u.username).sort()).toEqual(['iso-a-1', 'iso-a-2']);
    expect(b.map((u) => u.username)).toEqual(['iso-b-1']);
  });

  it('hides another school even when the row id is known', async () => {
    const target = await owner.user.findFirst({ where: { username: 'iso-b-1' } });

    const seen = await forSchool(SCHOOL_A, (tx) =>
      tx.user.findUnique({ where: { id: target!.id } }),
    );

    expect(seen).toBeNull();
  });

  it('refuses a write that claims another school', async () => {
    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.user.create({
          data: { schoolId: SCHOOL_B, username: 'iso-smuggled', role: 'STUDENT', passwordHash: 'x' },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses to move a row into another school', async () => {
    const target = await owner.user.findFirst({ where: { username: 'iso-a-1' } });

    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.user.update({ where: { id: target!.id }, data: { schoolId: SCHOOL_B } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('leaves no school behind on a reused connection', async () => {
    await forSchool(SCHOOL_A, (tx) => tx.user.findMany());

    const after = await app.user.findMany({ where: { username: { startsWith: 'iso-' } } });

    expect(after).toHaveLength(0);
  });

  it('keeps overlapping requests apart', async () => {
    const runs = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const school = i % 2 ? SCHOOL_B : SCHOOL_A;
        const expected = i % 2 ? 'iso-b' : 'iso-a';
        return forSchool(school, (tx) =>
          tx.user.findMany({ where: { username: { startsWith: 'iso-' } } }),
        ).then((rows) => rows.every((r) => r.username.startsWith(expected)));
      }),
    );

    expect(runs.every(Boolean)).toBe(true);
  });
});

describe('the application role cannot switch the protection off', () => {
  it('is not a superuser and cannot bypass policies', async () => {
    const [role] = await app.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;

    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  /**
   * Each attempt runs inside a transaction that never commits.
   *
   * PostgreSQL rolls back schema changes like any other statement, so if the
   * setup is ever wrong and one of these succeeds, the test still fails but
   * the change is discarded instead of leaving the database unprotected. An
   * earlier version of this file did leave it unprotected, which is exactly
   * the accident this prevents.
   */
  async function mustBeRefused(statement: string): Promise<void> {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(statement);
        throw new Error(`PERMITTED, and should not have been: ${statement}`);
      }),
    ).rejects.toThrow(/must be owner|permission denied|superuser|does not exist/i);
  }

  it('cannot disable row level security', async () => {
    await mustBeRefused('ALTER TABLE users DISABLE ROW LEVEL SECURITY');
  });

  it('cannot remove FORCE', async () => {
    await mustBeRefused('ALTER TABLE users NO FORCE ROW LEVEL SECURITY');
  });

  it('cannot drop the policy', async () => {
    await mustBeRefused('DROP POLICY tenant_isolation ON users');
  });

  it('cannot add a policy of its own', async () => {
    await mustBeRefused('CREATE POLICY sneaky ON users USING (true)');
  });

  it('cannot grant itself the right to bypass policies', async () => {
    await mustBeRefused(`ALTER ROLE ${process.env.APP_DB_USER ?? 'app_user'} BYPASSRLS`);
  });

  it('cannot become the owner', async () => {
    await mustBeRefused('SET ROLE postgres');
  });

  /**
   * FORCE is what binds the table owner too. Without it the protection looks
   * configured but does nothing for the owner, which is the exact trap this
   * whole design avoids.
   */
  it('has FORCE row level security on every tenant table', async () => {
    const tables = await owner.$queryRaw<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = ANY(${[...TENANT_TABLES]})
    `;

    expect(tables).toHaveLength(TENANT_TABLES.length);
    for (const table of tables) {
      expect(table.relrowsecurity, `${table.relname} does not have RLS enabled`).toBe(true);
      expect(table.relforcerowsecurity, `${table.relname} is missing FORCE`).toBe(true);
    }
  });
});
