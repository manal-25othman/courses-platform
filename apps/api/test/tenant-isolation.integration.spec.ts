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

// Content owned by school A, used by the write-protection tests below.
const COURSE_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const UNIT_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const QUESTION_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SET_A = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const SECTION_A = '11111111-1111-1111-1111-111111111111';
const VOCAB_A = '22222222-2222-2222-2222-222222222222';
const MEDIA_A = '33333333-3333-3333-3333-333333333333';
const QUESTION_A2 = '44444444-4444-4444-4444-444444444444';
const ITEM_A = '55555555-5555-5555-5555-555555555555';

const owner = new PrismaClient({ datasourceUrl: OWNER_URL });
const app = new PrismaClient({ datasourceUrl: APP_URL });

/** Thrown to roll a transaction back once an attempt has been observed. */
class RollBack extends Error {}

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

  // Shared content owned by school A. It is deliberately readable by school B,
  // which is exactly what made the write paths worth testing separately.
  await owner.course.upsert({
    where: { id: COURSE_A },
    update: {},
    create: {
      id: COURSE_A,
      title: 'Isolation Test Course',
      ownerSchoolId: SCHOOL_A,
      isSharedMaster: true,
    },
  });
  await owner.unit.upsert({
    where: { id: UNIT_A },
    update: {},
    create: { id: UNIT_A, courseId: COURSE_A, title: 'Isolation Test Unit', orderIndex: 0 },
  });
  await owner.question.upsert({
    where: { id: QUESTION_A },
    update: {},
    create: {
      id: QUESTION_A,
      unitId: UNIT_A,
      typeKey: 'multiple_choice',
      prompt: 'Isolation test question',
      payload: { options: [{ id: 'a', text: 'x' }] },
      answerKey: { correctOptionId: 'a' },
    },
  });
  await owner.question.upsert({
    where: { id: QUESTION_A2 },
    update: {},
    create: {
      id: QUESTION_A2,
      unitId: UNIT_A,
      typeKey: 'true_false',
      prompt: 'Isolation test question two',
      payload: {},
      answerKey: { correct: true },
      orderIndex: 1,
    },
  });
  await owner.questionSet.upsert({
    where: { id: SET_A },
    update: {},
    create: { id: SET_A, unitId: UNIT_A, title: 'Isolation Test Set' },
  });

  // Every content table needs at least one row owned by school A, otherwise a
  // "nothing was deleted" assertion would pass simply because there was
  // nothing there to delete.
  await owner.questionSetItem.upsert({
    where: { id: ITEM_A },
    update: {},
    create: { id: ITEM_A, setId: SET_A, questionId: QUESTION_A, orderIndex: 0 },
  });
  await owner.unitSection.upsert({
    where: { id: SECTION_A },
    update: {},
    create: {
      id: SECTION_A,
      unitId: UNIT_A,
      typeKey: 'reading',
      orderIndex: 0,
      title: 'Isolation Test Section',
    },
  });
  await owner.vocabularyItem.upsert({
    where: { id: VOCAB_A },
    update: {},
    create: { id: VOCAB_A, unitId: UNIT_A, orderIndex: 0, wordEn: 'isolation' },
  });
  await owner.mediaAsset.upsert({
    where: { id: MEDIA_A },
    update: {},
    create: { id: MEDIA_A, sectionId: SECTION_A, url: 'https://example.invalid/a.png', mimeType: 'image/png' },
  });
});

const TENANT_TABLES = [
  'users',
  'schools',
  'teacher_profiles',
  'student_profiles',
  'audit_log',
  'settings',
  // Content, added in Phase 3.
  'courses',
  'units',
  'unit_sections',
  'vocabulary_items',
  'media_assets',
  // Questions, added in Phase 4. These hold the answer keys.
  'questions',
  'question_sets',
  'question_set_items',
] as const;

afterAll(async () => {
  await owner.mediaAsset.deleteMany({ where: { id: MEDIA_A } });
  await owner.vocabularyItem.deleteMany({ where: { unitId: UNIT_A } });
  await owner.unitSection.deleteMany({ where: { unitId: UNIT_A } });
  await owner.questionSetItem.deleteMany({ where: { setId: SET_A } });
  await owner.questionSet.deleteMany({ where: { id: SET_A } });
  await owner.question.deleteMany({ where: { unitId: UNIT_A } });
  await owner.unit.deleteMany({ where: { id: UNIT_A } });
  await owner.course.deleteMany({ where: { id: COURSE_A } });
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

  /**
   * Content tables were the exception that proved this rule worth testing.
   * Shared curriculum is readable by every school on purpose, and the policy
   * said so in a way that was also true when NO school was set — so an
   * unscoped query saw every course, unit and question, answer keys included.
   * These check the whole set, not just `users`.
   */
  it.each([
    'courses',
    'units',
    'unit_sections',
    'vocabulary_items',
    'questions',
    'question_sets',
  ])('returns nothing from %s when no school is set', async (table) => {
    const [row] = await app.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}"`,
    );

    expect(Number(row.count)).toBe(0);
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

/**
 * Shared content is READABLE by every school on purpose (the approved shared
 * library). Writing is a different matter, and PostgreSQL treats it
 * differently too: WITH CHECK never applies to DELETE, so the read allowance
 * silently made another school's curriculum deletable. These tests hold that
 * line — read yes, change no.
 */
describe('only the owning school may change shared content', () => {
  it.each([
    'courses',
    'units',
    'unit_sections',
    'vocabulary_items',
    'media_assets',
    'questions',
    'question_sets',
    'question_set_items',
  ])('refuses a delete of %s by another school', async (table) => {
    // The attempt runs inside a transaction that always rolls back, and what
    // is asserted is the number of rows the DELETE itself reported. Comparing
    // row counts afterwards would not do: deleting a course cascades to its
    // units and questions, so one unprotected table would hide the state of
    // every table below it.
    let deleted = -1;

    await forSchool(SCHOOL_B, async (tx) => {
      deleted = await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
      throw new RollBack();
    }).catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });

    expect(deleted, `another school deleted ${deleted} rows from ${table}`).toBe(0);
  });

  it("lets another school read school A's shared curriculum", async () => {
    const seen = await forSchool(SCHOOL_B, (tx) =>
      tx.question.findMany({ where: { unitId: UNIT_A } }),
    );

    expect(seen).toHaveLength(2);
  });

  it("refuses to add an item to another school's question set", async () => {
    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.questionSetItem.create({
          data: { setId: SET_A, questionId: QUESTION_A2, orderIndex: 1 },
        }),
      ),
    ).rejects.toThrow();

    const added = await owner.questionSetItem.count({
      where: { setId: SET_A, questionId: QUESTION_A2 },
    });
    expect(added).toBe(0);
  });

  it("refuses to change another school's question", async () => {
    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.$executeRawUnsafe(`UPDATE questions SET prompt = 'hijacked' WHERE id = '${QUESTION_A}'`),
      ),
    ).rejects.toThrow();

    const q = await owner.question.findUnique({ where: { id: QUESTION_A } });
    expect(q?.prompt).toBe('Isolation test question');
  });

  it('still lets the owning school delete its own content', async () => {
    let deleted = -1;

    await forSchool(SCHOOL_A, async (tx) => {
      deleted = await tx.$executeRawUnsafe(
        `DELETE FROM question_set_items WHERE set_id = '${SET_A}'`,
      );
      throw new RollBack();
    }).catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });

    expect(deleted).toBe(1);
  });
});

/**
 * Some audit entries belong to no school at all — a sign-out, or a failed
 * sign-in for a username nobody has. They must still be recorded (SRS 37,
 * 28.6.3), and the policy allows exactly that shape. What did not work was
 * writing one through an ORM: PostgreSQL makes a RETURNING row satisfy the
 * table's read rule too, and that rule compares school_id to the current
 * school — NULL against NULL, which is not true. Every such entry was refused
 * and silently dropped.
 */
describe('audit entries that belong to no school', () => {
  const APP_USER = process.env.APP_DB_USER ?? 'app_user';

  it('can be written with no school set', async () => {
    const action = `test.schoolless.${Date.now()}`;

    await app.$executeRawUnsafe(
      `INSERT INTO audit_log (id, action, school_id, created_at)
       VALUES (gen_random_uuid(), '${action}', NULL, now())`,
    );

    const rows = await owner.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(1);
    expect(rows[0].schoolId).toBeNull();

    await owner.auditLog.deleteMany({ where: { action } });
  });

  /**
   * The shape the ORM produces, kept as a test so the reason for the raw
   * insert in AuditService is not lost and quietly undone later.
   */
  it('is refused when the row is asked for back', async () => {
    const action = `test.returning.${Date.now()}`;

    await expect(
      app.$executeRawUnsafe(
        `INSERT INTO audit_log (id, action, school_id, created_at)
         VALUES (gen_random_uuid(), '${action}', NULL, now())
         RETURNING id`,
      ),
    ).rejects.toThrow();

    const rows = await owner.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(0);
    expect(APP_USER).toBeTruthy();
  });

  it('still refuses an entry claiming another school', async () => {
    const action = `test.otherschool.${Date.now()}`;

    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO audit_log (id, action, school_id, created_at)
           VALUES (gen_random_uuid(), '${action}', '${SCHOOL_B}', now())`,
        ),
      ),
    ).rejects.toThrow();

    const rows = await owner.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(0);
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
