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
const ATTEMPT_A = '66666666-6666-6666-6666-666666666666';
const VOCAB_PROGRESS_A = '77777777-7777-7777-7777-777777777777';
// Phase 6: a picture may now hang off a question or a word, not only a section.
const MEDIA_Q = 'aaaaaaaa-0000-4000-8000-000000000001';
const MEDIA_V = 'aaaaaaaa-0000-4000-8000-000000000002';

// An ordinary school's own curriculum: owned by school A and shared with
// nobody. Everything above it is the shared master library, which school B may
// read on purpose; these are the rows school B must never see.
const PRIVATE_COURSE_A = 'aaaaaaaa-0000-4000-8000-000000000010';
const PRIVATE_UNIT_A = 'aaaaaaaa-0000-4000-8000-000000000011';
const PRIVATE_QUESTION_A = 'aaaaaaaa-0000-4000-8000-000000000012';
const PRIVATE_VOCAB_A = 'aaaaaaaa-0000-4000-8000-000000000013';

// The platform operator, who belongs to no school at all.
const PLATFORM_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000020';

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

  // School A's own curriculum, shared with nobody. Created the way the
  // application creates one, so the flag is whatever a real course gets.
  await owner.course.upsert({
    where: { id: PRIVATE_COURSE_A },
    update: {},
    create: {
      id: PRIVATE_COURSE_A,
      title: 'Isolation Test Private Course',
      ownerSchoolId: SCHOOL_A,
      isSharedMaster: false,
    },
  });
  await owner.unit.upsert({
    where: { id: PRIVATE_UNIT_A },
    update: {},
    create: {
      id: PRIVATE_UNIT_A,
      courseId: PRIVATE_COURSE_A,
      title: 'Isolation Test Private Unit',
      orderIndex: 0,
      // Published, because the leak this guards against reached a student
      // through her own unit list, which only ever holds published units.
      status: 'PUBLISHED',
    },
  });
  await owner.question.upsert({
    where: { id: PRIVATE_QUESTION_A },
    update: {},
    create: {
      id: PRIVATE_QUESTION_A,
      unitId: PRIVATE_UNIT_A,
      typeKey: 'multiple_choice',
      prompt: 'Private question',
      payload: { options: [{ id: 'a', text: 'x' }] },
      answerKey: { correctOptionId: 'a' },
    },
  });
  await owner.vocabularyItem.upsert({
    where: { id: PRIVATE_VOCAB_A },
    update: {},
    create: {
      id: PRIVATE_VOCAB_A,
      unitId: PRIVATE_UNIT_A,
      orderIndex: 0,
      wordEn: 'private',
    },
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
  await owner.mediaAsset.upsert({
    where: { id: MEDIA_Q },
    update: {},
    create: {
      id: MEDIA_Q,
      questionId: QUESTION_A,
      url: 'https://example.invalid/q.png',
      mimeType: 'image/png',
    },
  });
  await owner.mediaAsset.upsert({
    where: { id: MEDIA_V },
    update: {},
    create: {
      id: MEDIA_V,
      vocabularyItemId: VOCAB_A,
      url: 'https://example.invalid/v.mp3',
      mimeType: 'audio/mpeg',
    },
  });

  // Progress belonging to a student of school A. These rows exist for the whole
  // run so that "an unscoped query sees nothing" is a real assertion and not
  // one that passes because the table happened to be empty.
  const studentA = await owner.user.findFirstOrThrow({ where: { username: 'iso-a-1' } });

  await owner.activityAttempt.upsert({
    where: { id: ATTEMPT_A },
    update: {},
    create: {
      id: ATTEMPT_A,
      studentId: studentA.id,
      unitId: UNIT_A,
      seed: 'isolation-test',
      status: 'SUBMITTED',
      scorePercent: 50,
    },
  });
  await owner.attemptAnswer.upsert({
    where: { id: '88888888-8888-8888-8888-888888888888' },
    update: {},
    create: {
      id: '88888888-8888-8888-8888-888888888888',
      attemptId: ATTEMPT_A,
      questionId: QUESTION_A,
      orderIndex: 0,
      snapshot: { questionId: QUESTION_A, typeKey: 'multiple_choice', points: 1 },
    },
  });
  await owner.vocabularyProgress.upsert({
    where: { id: VOCAB_PROGRESS_A },
    update: {},
    create: {
      id: VOCAB_PROGRESS_A,
      studentId: studentA.id,
      itemId: VOCAB_A,
      seenAt: new Date(),
      audioPlayedAt: new Date(),
      learnedAt: new Date(),
    },
  });
  await owner.sectionProgress.upsert({
    where: { id: '99999999-9999-9999-9999-999999999999' },
    update: {},
    create: {
      id: '99999999-9999-9999-9999-999999999999',
      studentId: studentA.id,
      sectionId: SECTION_A,
    },
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
  // Progress, added in Phase 5. Unlike the curriculum above, this is personal
  // data about a named child and is never shared between schools.
  'vocabulary_progress',
  'section_progress',
  'activity_attempts',
  'attempt_answers',
  // Feedback, added after Phase 5. Personal data about a named child.
  'messages',
] as const;

afterAll(async () => {
  await owner.attemptAnswer.deleteMany({ where: { attemptId: ATTEMPT_A } });
  await owner.activityAttempt.deleteMany({ where: { id: ATTEMPT_A } });
  await owner.vocabularyProgress.deleteMany({ where: { id: VOCAB_PROGRESS_A } });
  await owner.sectionProgress.deleteMany({ where: { sectionId: SECTION_A } });
  await owner.mediaAsset.deleteMany({ where: { id: { in: [MEDIA_A, MEDIA_Q, MEDIA_V] } } });
  await owner.vocabularyItem.deleteMany({ where: { unitId: UNIT_A } });
  await owner.unitSection.deleteMany({ where: { unitId: UNIT_A } });
  await owner.questionSetItem.deleteMany({ where: { setId: SET_A } });
  await owner.questionSet.deleteMany({ where: { id: SET_A } });
  await owner.question.deleteMany({ where: { unitId: UNIT_A } });
  await owner.unit.deleteMany({ where: { id: UNIT_A } });
  await owner.course.deleteMany({ where: { id: COURSE_A } });
  await owner.vocabularyItem.deleteMany({ where: { unitId: PRIVATE_UNIT_A } });
  await owner.question.deleteMany({ where: { unitId: PRIVATE_UNIT_A } });
  await owner.unit.deleteMany({ where: { id: PRIVATE_UNIT_A } });
  await owner.course.deleteMany({ where: { id: PRIVATE_COURSE_A } });
  await owner.user.deleteMany({ where: { schoolId: { in: [SCHOOL_A, SCHOOL_B] } } });
  await owner.user.deleteMany({ where: { id: PLATFORM_ADMIN } });
  await owner.user.deleteMany({ where: { username: 'iso-invariant' } });
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
 * Phase 6 gave a picture two more places to live: a question and a word.
 *
 * The media policies were written when a grammar section was the only parent
 * a row could have, and their read rule began `section_id IS NULL OR ...`.
 * That branch was harmless while a section-less row could not exist. Once one
 * could, it would have made every picture on a question or a word readable by
 * every school on the platform. The restrictive delete rule had the mirror
 * problem: it required a section, so a picture on a question could never have
 * been deleted by anyone, including the teacher who uploaded it.
 */
describe('pictures and audio attached to a question or a word', () => {
  it('refuses a row that names no parent', async () => {
    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO media_assets (id, url, mime_type, order_index, created_at)
           VALUES (gen_random_uuid(), 'https://example.invalid/orphan.png', 'image/png', 0, now())`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('refuses a row that names two parents', async () => {
    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO media_assets (id, section_id, question_id, url, mime_type, order_index, created_at)
           VALUES (gen_random_uuid(), '${SECTION_A}', '${QUESTION_A}',
                   'https://example.invalid/two.png', 'image/png', 0, now())`,
        ),
      ),
    ).rejects.toThrow();
  });

  it.each([
    ['a question', 'question_id', QUESTION_A],
    ['a word', 'vocabulary_item_id', VOCAB_A],
  ])("refuses another school's attempt to attach a file to %s", async (_what, column, parentId) => {
    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO media_assets (id, ${column}, url, mime_type, order_index, created_at)
           VALUES (gen_random_uuid(), '${parentId}', 'https://example.invalid/x.png',
                   'image/png', 0, now())`,
        ),
      ),
    ).rejects.toThrow();
  });

  it.each([
    ['a question', MEDIA_Q],
    ['a word', MEDIA_V],
  ])("refuses another school's attempt to delete the file on %s", async (_what, id) => {
    let deleted = -1;

    await forSchool(SCHOOL_B, async (tx) => {
      deleted = await tx.$executeRawUnsafe(`DELETE FROM media_assets WHERE id = '${id}'`);
      throw new RollBack();
    }).catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });

    expect(deleted).toBe(0);
  });

  it.each([
    ['a question', MEDIA_Q],
    ['a word', MEDIA_V],
  ])('still lets the owning school delete the file on %s', async (_what, id) => {
    let deleted = -1;

    await forSchool(SCHOOL_A, async (tx) => {
      deleted = await tx.$executeRawUnsafe(`DELETE FROM media_assets WHERE id = '${id}'`);
      throw new RollBack();
    }).catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });

    expect(deleted).toBe(1);
  });

  it('lets the owning school attach a file to its own question', async () => {
    let created = -1;

    await forSchool(SCHOOL_A, async (tx) => {
      created = await tx.$executeRawUnsafe(
        `INSERT INTO media_assets (id, question_id, url, mime_type, order_index, created_at)
         VALUES (gen_random_uuid(), '${QUESTION_A}', 'https://example.invalid/ok.png',
                 'image/png', 0, now())`,
      );
      throw new RollBack();
    }).catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });

    expect(created).toBe(1);
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

/**
 * A student's progress is not curriculum.
 *
 * Content is readable across schools on purpose. Progress is the opposite: it
 * says what a named child has done, so these tables have no shared-master
 * allowance at all — not for reading, and not for writing.
 */
describe("a student's progress never leaves her school", () => {
  it.each([
    'vocabulary_progress',
    'section_progress',
    'activity_attempts',
    'attempt_answers',
  ])('returns nothing from %s when no school is set', async (table) => {
    const [row] = await app.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}"`,
    );

    expect(Number(row.count)).toBe(0);
  });

  it("does not show one school another school's attempts", async () => {
    const asOwner = await forSchool(SCHOOL_A, (tx) =>
      tx.activityAttempt.findMany({ where: { id: ATTEMPT_A } }),
    );
    const asOther = await forSchool(SCHOOL_B, (tx) =>
      tx.activityAttempt.findMany({ where: { id: ATTEMPT_A } }),
    );

    expect(asOwner).toHaveLength(1);
    expect(asOther).toHaveLength(0);
  });

  it("does not show one school another school's word progress", async () => {
    const asOther = await forSchool(SCHOOL_B, (tx) =>
      tx.vocabularyProgress.findMany({ where: { id: VOCAB_PROGRESS_A } }),
    );

    expect(asOther).toHaveLength(0);
  });

  it("refuses to record progress against another school's student", async () => {
    const studentA = await owner.user.findFirstOrThrow({ where: { username: 'iso-a-1' } });

    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO activity_attempts (id, student_id, unit_id, seed, status, started_at)
           VALUES (gen_random_uuid(), '${studentA.id}', '${UNIT_A}', 'x', 'IN_PROGRESS', now())`,
        ),
      ),
    ).rejects.toThrow();
  });
});

/**
 * Feedback is between one teacher and one child. It is not curriculum, so it
 * has no shared allowance at all — and unlike progress, the school is on the
 * row itself, so the check is direct rather than reached through a join.
 */
describe('feedback never leaves its school', () => {
  const MESSAGE_A = 'aaaa1111-0000-0000-0000-00000000aaaa';

  it('returns nothing when no school is set', async () => {
    const [row] = await app.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*)::bigint AS count FROM messages',
    );

    expect(Number(row.count)).toBe(0);
  });

  it("does not show one school another school's messages", async () => {
    const teacherA = await owner.user.findFirstOrThrow({ where: { username: 'iso-a-1' } });
    const studentA = await owner.user.findFirstOrThrow({ where: { username: 'iso-a-2' } });

    await owner.message.upsert({
      where: { id: MESSAGE_A },
      update: {},
      create: {
        id: MESSAGE_A,
        schoolId: SCHOOL_A,
        teacherId: teacherA.id,
        studentId: studentA.id,
        senderId: teacherA.id,
        body: 'Well done this week.',
      },
    });

    const mine = await forSchool(SCHOOL_A, (tx) => tx.message.findMany({ where: { id: MESSAGE_A } }));
    const theirs = await forSchool(SCHOOL_B, (tx) => tx.message.findMany({ where: { id: MESSAGE_A } }));

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(0);

    await owner.message.deleteMany({ where: { id: MESSAGE_A } });
  });

  it("refuses to write a message into another school", async () => {
    const teacherA = await owner.user.findFirstOrThrow({ where: { username: 'iso-a-1' } });
    const studentA = await owner.user.findFirstOrThrow({ where: { username: 'iso-a-2' } });

    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO messages (id, school_id, teacher_id, student_id, sender_id, body, created_at)
           VALUES (gen_random_uuid(), '${SCHOOL_A}', '${teacherA.id}', '${studentA.id}', '${teacherA.id}', 'x', now())`,
        ),
      ),
    ).rejects.toThrow();
  });
});

/**
 * The application connection should be able to do its job and nothing else.
 *
 * These are not about one school seeing another's rows; they are about what a
 * stolen application connection could reach. Each was a real hole found by a
 * health check on 2026-08-31.
 */
describe('the application role has no privileges it does not need', () => {
  /**
   * `_prisma_migrations` belongs to no school, so no policy covers it, and the
   * grant was the only thing in the way. app_user could delete the whole
   * ledger — which would make the next deploy try to re-apply every migration.
   */
  it('cannot touch the migration ledger', async () => {
    const before = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*)::bigint AS count FROM _prisma_migrations',
    );

    await expect(
      app.$executeRawUnsafe('DELETE FROM _prisma_migrations'),
    ).rejects.toThrow(/permission denied/i);

    const after = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*)::bigint AS count FROM _prisma_migrations',
    );

    expect(Number(after[0].count)).toBe(Number(before[0].count));
    expect(Number(after[0].count)).toBeGreaterThan(0);
  });

  /**
   * Settings resolve from the most specific scope down to global, so the
   * application must READ every scope. Writing is another matter: the old
   * policy said `scope <> 'SCHOOL' OR ...` for both, which let any school
   * change a value governing all of them.
   */
  /**
   * These make their own global value rather than relying on one being
   * seeded, because CI applies migrations without running the seed and a test
   * that quietly passes on an empty table proves nothing.
   */
  const GLOBAL_KEY = 'iso.global.probe';

  it('can read a global setting', async () => {
    await owner.setting.create({ data: { scope: 'GLOBAL', key: GLOBAL_KEY, value: 80 } });

    const rows = await forSchool(SCHOOL_A, (tx) =>
      tx.setting.findMany({ where: { key: GLOBAL_KEY } }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toEqual(80);

    await owner.setting.deleteMany({ where: { key: GLOBAL_KEY } });
  });

  it('cannot change a global setting', async () => {
    await owner.setting.create({ data: { scope: 'GLOBAL', key: GLOBAL_KEY, value: 80 } });

    await forSchool(SCHOOL_A, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE settings SET value = '1' WHERE key = '${GLOBAL_KEY}' AND scope = 'GLOBAL'`,
      ),
    );

    const after = await owner.setting.findFirst({ where: { key: GLOBAL_KEY } });
    expect(after?.value).toEqual(80);

    await owner.setting.deleteMany({ where: { key: GLOBAL_KEY } });
  });

  it('cannot delete a global setting either', async () => {
    await owner.setting.create({ data: { scope: 'GLOBAL', key: GLOBAL_KEY, value: 80 } });

    await forSchool(SCHOOL_A, (tx) =>
      tx.$executeRawUnsafe(`DELETE FROM settings WHERE key = '${GLOBAL_KEY}'`),
    );

    expect(await owner.setting.count({ where: { key: GLOBAL_KEY } })).toBe(1);

    await owner.setting.deleteMany({ where: { key: GLOBAL_KEY } });
  });

  it("can write its own school's override", async () => {
    const created = await forSchool(SCHOOL_A, (tx) =>
      tx.setting.create({
        data: { scope: 'SCHOOL', scopeId: SCHOOL_A, key: 'iso.test', value: 1 },
      }),
    );

    expect(created.id).toBeTruthy();
    await owner.setting.deleteMany({ where: { key: 'iso.test' } });
  });

  it("cannot write another school's override", async () => {
    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.setting.create({
          data: { scope: 'SCHOOL', scopeId: SCHOOL_B, key: 'iso.test', value: 1 },
        }),
      ),
    ).rejects.toThrow();

    const leaked = await owner.setting.count({ where: { key: 'iso.test' } });
    expect(leaked).toBe(0);
  });

  /** The registries are read by everyone and changed by nobody at runtime. */
  it.each(['question_types', 'section_types'])(
    'cannot change the %s registry',
    async (table) => {
      await expect(
        app.$executeRawUnsafe(`UPDATE "${table}" SET display_name = 'changed'`),
      ).rejects.toThrow(/permission denied/i);
    },
  );
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

/**
 * A school's own curriculum is private to it.
 *
 * `is_shared_master` decides whether a course is the master library everyone
 * may read, and it once defaulted to true while no code ever set it — so every
 * school's private curriculum was published to every other tenant the moment
 * it was created. A teacher opening the Curriculum screen was shown another
 * school's units; a student's own unit list carried another school's published
 * unit; and the questions hanging off those units gave up their answer keys.
 *
 * The tests above cover the master library, which school B may read on
 * purpose. These cover the ordinary case, which is every other course. Both
 * matter: the bug was not that sharing existed, it was that nothing
 * distinguished a shared course from a private one.
 */
describe('a private course belongs to one school alone', () => {
  it('does not share a course unless it is told to', async () => {
    const [column] = await owner.$queryRaw<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'courses' AND column_name = 'is_shared_master'
    `;

    expect(column?.column_default).toBe('false');
  });

  it('lets the owning school read its own private course', async () => {
    const seen = await forSchool(SCHOOL_A, (tx) =>
      tx.course.findMany({ where: { id: PRIVATE_COURSE_A } }),
    );

    expect(seen).toHaveLength(1);
  });

  it.each([
    ['course', (tx: PrismaClient) => tx.course.findMany({ where: { id: PRIVATE_COURSE_A } })],
    ['units', (tx: PrismaClient) => tx.unit.findMany({ where: { courseId: PRIVATE_COURSE_A } })],
    ['questions', (tx: PrismaClient) => tx.question.findMany({ where: { unitId: PRIVATE_UNIT_A } })],
    ['vocabulary', (tx: PrismaClient) => tx.vocabularyItem.findMany({ where: { unitId: PRIVATE_UNIT_A } })],
  ] as const)("hides school A's private %s from another school", async (_what, read) => {
    const seen = await forSchool(SCHOOL_B, (tx) => read(tx));

    expect(seen).toHaveLength(0);
  });

  /**
   * Knowing the identifier must not help. The teacher screens address a unit
   * by its id, so this is the shape a cross-tenant attempt actually takes.
   */
  it('hides a private unit from another school that knows its identifier', async () => {
    const seen = await forSchool(SCHOOL_B, (tx) =>
      tx.unit.findUnique({ where: { id: PRIVATE_UNIT_A } }),
    );

    expect(seen).toBeNull();
  });

  /**
   * The leak that reached students: her unit list asks for published units,
   * and a private unit belonging to someone else answered it.
   */
  it("keeps another school's published unit out of a student's unit list", async () => {
    const published = await forSchool(SCHOOL_B, (tx) =>
      tx.unit.findMany({ where: { status: 'PUBLISHED' } }),
    );

    expect(published.map((unit) => unit.id)).not.toContain(PRIVATE_UNIT_A);
  });

  it("refuses a write to school A's private curriculum", async () => {
    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.unit.update({
          where: { id: PRIVATE_UNIT_A },
          data: { title: 'changed by another school' },
        }),
      ),
    ).rejects.toThrow();

    const unit = await owner.unit.findUnique({ where: { id: PRIVATE_UNIT_A } });
    expect(unit?.title).toBe('Isolation Test Private Unit');
  });

  it("refuses to add vocabulary to school A's private unit", async () => {
    await expect(
      forSchool(SCHOOL_B, (tx) =>
        tx.vocabularyItem.create({
          data: { unitId: PRIVATE_UNIT_A, orderIndex: 99, wordEn: 'intruder' },
        }),
      ),
    ).rejects.toThrow();

    const added = await owner.vocabularyItem.count({
      where: { unitId: PRIVATE_UNIT_A, wordEn: 'intruder' },
    });
    expect(added).toBe(0);
  });

  it("refuses a delete of school A's private course", async () => {
    let deleted = -1;

    await forSchool(SCHOOL_B, async (tx) => {
      deleted = await tx.$executeRawUnsafe(
        `DELETE FROM "courses" WHERE id = '${PRIVATE_COURSE_A}'`,
      );
      throw new RollBack();
    }).catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });

    expect(deleted).toBe(0);
  });
});

/**
 * The platform operator's boundary.
 *
 * Reading across schools is the one thing the row-level policies are built to
 * prevent, so the platform dashboard does not ask them to make an exception:
 * it goes through two functions that return counts and school-level facts and
 * nothing else. These check that the boundary is as narrow as it claims — that
 * the policies are untouched, that the functions cannot be reached by anybody
 * else, and that a platform admin cannot also be a member of a school.
 */
describe('the platform boundary is narrow and explicit', () => {
  /**
   * The rule that keeps platform sight and tenant membership apart. Held by
   * the database, because a rule enforced only by whichever code path happens
   * to create a row is not enforced.
   */
  it.each([
    ['a platform admin with a school', `'PLATFORM_ADMIN'`, `'${SCHOOL_A}'`],
    ['a teacher with no school', `'TEACHER'`, 'NULL'],
    ['a school admin with no school', `'ADMIN'`, 'NULL'],
    ['a student with no school', `'STUDENT'`, 'NULL'],
  ])('refuses %s', async (_name, role, school) => {
    await expect(
      owner.$executeRawUnsafe(`
        INSERT INTO users (id, school_id, role, username, password_hash, updated_at)
        VALUES (gen_random_uuid(), ${school}, ${role}, 'iso-invariant', 'x', now())
      `),
    ).rejects.toThrow(/users_platform_admin_has_no_school/);
  });

  it('allows a platform admin with no school', async () => {
    await owner.$executeRawUnsafe(`
      INSERT INTO users (id, school_id, role, username, password_hash, updated_at)
      VALUES ('${PLATFORM_ADMIN}', NULL, 'PLATFORM_ADMIN', 'iso-operator', 'x', now())
    `);

    const row = await owner.user.findUnique({ where: { id: PLATFORM_ADMIN } });
    expect(row?.schoolId).toBeNull();
  });

  /**
   * The functions are the platform's whole read surface, and a SECURITY
   * DEFINER function is only as narrow as its grants.
   */
  it.each(['platform_totals', 'platform_school_overview'])(
    '%s runs as its owner, with a pinned search path',
    async (name) => {
      const [fn] = await owner.$queryRawUnsafe<
        { prosecdef: boolean; proconfig: string[] | null }[]
      >(`SELECT prosecdef, proconfig FROM pg_proc WHERE proname = '${name}'`);

      expect(fn.prosecdef, `${name} is not SECURITY DEFINER`).toBe(true);
      expect(fn.proconfig, `${name} does not pin its search_path`).toContain('search_path=public');
    },
  );

  it.each(['platform_totals', 'platform_school_overview'])(
    '%s is not executable by everybody',
    async (name) => {
      const [grant] = await owner.$queryRawUnsafe<{ open: boolean }[]>(
        `SELECT has_function_privilege('public', '${name}()', 'EXECUTE') AS open`,
      );

      expect(grant.open, `${name} is executable by PUBLIC`).toBe(false);
    },
  );

  /**
   * The counts must be counts. A column carrying a name, an address or a
   * hash would turn an aggregate route into a way of reading the roster of
   * every school at once, so the shape is asserted rather than trusted.
   */
  it('returns no column that could carry anything personal', async () => {
    const columns = await owner.$queryRaw<{ name: string }[]>`
      SELECT lower(unnest(proargnames)) AS name
      FROM pg_proc
      WHERE proname IN ('platform_totals', 'platform_school_overview')
    `;

    const named = columns.map((column) => column.name);
    expect(named.length).toBeGreaterThan(0);
    for (const forbidden of ['username', 'email', 'password_hash', 'token', 'body', 'full_name']) {
      expect(named, `a function returns ${forbidden}`).not.toContain(forbidden);
    }
  });

  /** The policies themselves are exactly as they were. */
  it('leaves every tenant table with row level security forced', async () => {
    const tables = await owner.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_class
      WHERE relname = ANY(${[...TENANT_TABLES]}) AND relrowsecurity AND relforcerowsecurity
    `;

    expect(Number(tables[0].n)).toBe(TENANT_TABLES.length);
  });

  /**
   * And the ordinary path is unchanged: a school still sees only itself, so
   * nothing about adding a platform role loosened the tenant barrier.
   */
  it('still shows a school only its own row', async () => {
    const seen = await forSchool(SCHOOL_B, (tx) => tx.school.findMany());

    expect(seen.map((school) => school.id)).toEqual([SCHOOL_B]);
  });
});

/**
 * Opening, closing and renaming a school.
 *
 * A platform operator can do these because five functions let her, and for no
 * other reason: `app_user` cannot insert a school under any scope, which is
 * why creating one is a function call rather than a write with the policies
 * held open. These check that the five are as narrow as the two before them,
 * that creating a school is all-or-nothing, and that closing one really does
 * end the sessions inside it.
 */
describe('schools are managed through narrow functions', () => {
  const SCHOOLS = [
    'school_is_active',
    'platform_create_school',
    'platform_school_detail',
    'platform_rename_school',
    'platform_set_school_status',
  ];

  /** How each is called, for the privilege check, which needs the signature. */
  const SIGNATURES: Record<string, string> = {
    school_is_active: 'school_is_active(uuid)',
    platform_create_school: 'platform_create_school(text, text, text, text, text)',
    platform_school_detail: 'platform_school_detail(uuid)',
    platform_rename_school: 'platform_rename_school(uuid, text)',
    platform_set_school_status: 'platform_set_school_status(uuid, user_status)',
  };

  const NEW_SCHOOL = 'Isolation Test C';

  async function dropSchool(name: string): Promise<void> {
    const rows = await owner.school.findMany({ where: { name } });
    for (const school of rows) {
      await owner.refreshToken.deleteMany({ where: { user: { schoolId: school.id } } });
      await owner.teacherProfile.deleteMany({ where: { user: { schoolId: school.id } } });
      await owner.user.deleteMany({ where: { schoolId: school.id } });
      await owner.school.delete({ where: { id: school.id } });
    }
  }

  afterAll(async () => {
    await dropSchool(NEW_SCHOOL);
    await dropSchool('Isolation Test C renamed');
  });

  it.each(SCHOOLS)('%s runs as its owner, with a pinned search path', async (name) => {
    const [fn] = await owner.$queryRawUnsafe<
      { prosecdef: boolean; proconfig: string[] | null }[]
    >(`SELECT prosecdef, proconfig FROM pg_proc WHERE proname = '${name}'`);

    expect(fn.prosecdef, `${name} is not SECURITY DEFINER`).toBe(true);
    expect(fn.proconfig, `${name} does not pin its search_path`).toContain('search_path=public');
  });

  it.each(SCHOOLS)('%s is not executable by everybody', async (name) => {
    const [grant] = await owner.$queryRawUnsafe<{ open: boolean }[]>(
      `SELECT has_function_privilege('public', '${SIGNATURES[name]}', 'EXECUTE') AS open`,
    );

    expect(grant.open, `${name} is executable by PUBLIC`).toBe(false);
  });

  /**
   * The detail function answers the same question as the overview, for one
   * school, so it must be as free of personal columns.
   */
  it('returns no column that could carry anything personal', async () => {
    const columns = await owner.$queryRaw<{ name: string }[]>`
      SELECT lower(unnest(proargnames)) AS name
      FROM pg_proc WHERE proname = 'platform_school_detail'
    `;

    const named = columns.map((column) => column.name);
    expect(named.length).toBeGreaterThan(0);
    for (const forbidden of ['username', 'email', 'password_hash', 'token', 'full_name']) {
      expect(named, `platform_school_detail returns ${forbidden}`).not.toContain(forbidden);
    }
  });

  /**
   * The reason creating a school is one function call rather than three
   * writes. If the administrator cannot be made, the school must not exist
   * either: a school nobody can sign into is worse than a visible failure.
   */
  it('creates a school and its first administrator together, or not at all', async () => {
    const [created] = await owner.$queryRawUnsafe<{ school_id: string; admin_id: string }[]>(
      `SELECT * FROM platform_create_school(
         '${NEW_SCHOOL}', 'iso-c-admin', 'iso-c@example.com', 'hash', 'Isolation C Admin')`,
    );

    const admin = await owner.user.findUnique({ where: { id: created.admin_id } });
    expect(admin?.role).toBe('ADMIN');
    expect(admin?.schoolId, 'the first admin belongs to the new school and no other').toBe(
      created.school_id,
    );
    expect(admin?.mustChangePassword, 'she is not left on the operator’s password').toBe(true);

    // A second school by the same name is refused, and leaves nothing behind.
    const before = await owner.user.count();
    // Matched on the SQLSTATE, not the wording: the function raises a sentence
    // of its own and Prisma replaces it before anything sees it. 23505 is what
    // AdminService reads to turn this into a 409, so it is what is asserted.
    await expect(
      owner.$executeRawUnsafe(
        `SELECT platform_create_school(
           '${NEW_SCHOOL.toLowerCase()}', 'iso-c-other', 'other@example.com', 'hash', 'Other')`,
      ),
    ).rejects.toThrow(/23505/);

    expect(await owner.user.count(), 'a refused creation left a user behind').toBe(before);
    expect(await owner.school.count({ where: { name: NEW_SCHOOL.toLowerCase() } })).toBe(0);
  });

  it('renames a school, and refuses a name already taken', async () => {
    const school = await owner.school.findFirstOrThrow({ where: { name: NEW_SCHOOL } });

    await owner.$executeRawUnsafe(
      `SELECT platform_rename_school('${school.id}'::uuid, 'Isolation Test C renamed')`,
    );
    expect((await owner.school.findUniqueOrThrow({ where: { id: school.id } })).name).toBe(
      'Isolation Test C renamed',
    );

    await expect(
      owner.$executeRawUnsafe(
        `SELECT platform_rename_school('${school.id}'::uuid, 'Isolation Test A')`,
      ),
    ).rejects.toThrow(/23505/);
  });

  /**
   * Closing a school has to mean something. `school_is_active` is what the
   * sign-in, renewal and describe paths consult, and the same statement that
   * closes a school ends every session in it.
   */
  it('closes a school, ending the sessions inside it and no others', async () => {
    const closing = await owner.school.findFirstOrThrow({
      where: { name: 'Isolation Test C renamed' },
    });
    const inside = await owner.user.findFirstOrThrow({ where: { schoolId: closing.id } });
    const outside = await owner.user.findFirstOrThrow({ where: { schoolId: SCHOOL_A } });

    for (const user of [inside, outside]) {
      await owner.refreshToken.create({
        data: {
          userId: user.id,
          familyId: user.id,
          tokenHash: `iso-close-${user.id}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }

    await owner.$executeRawUnsafe(
      `SELECT platform_set_school_status('${closing.id}'::uuid, 'DISABLED'::"user_status")`,
    );

    const [state] = await owner.$queryRawUnsafe<{ open: boolean }[]>(
      `SELECT school_is_active('${closing.id}'::uuid) AS open`,
    );
    expect(state.open, 'a closed school still lets people in').toBe(false);

    const closed = await owner.refreshToken.findFirstOrThrow({
      where: { tokenHash: `iso-close-${inside.id}` },
    });
    const untouched = await owner.refreshToken.findFirstOrThrow({
      where: { tokenHash: `iso-close-${outside.id}` },
    });

    expect(closed.revokedAt, 'a session inside the closed school survived').not.toBeNull();
    expect(untouched.revokedAt, 'a session in another school was revoked too').toBeNull();

    // And opening it again lets people back in.
    await owner.$executeRawUnsafe(
      `SELECT platform_set_school_status('${closing.id}'::uuid, 'ACTIVE'::"user_status")`,
    );
    const [reopened] = await owner.$queryRawUnsafe<{ open: boolean }[]>(
      `SELECT school_is_active('${closing.id}'::uuid) AS open`,
    );
    expect(reopened.open).toBe(true);

    await owner.refreshToken.deleteMany({ where: { tokenHash: `iso-close-${outside.id}` } });
  });

  /**
   * The platform operator has no school, and `school_is_active` is asked about
   * her too. A school-less account must not be locked out by a rule about
   * schools — and an id that names nothing must not be treated as open.
   */
  it('treats no school as open and an unknown school as closed', async () => {
    const [none] = await owner.$queryRawUnsafe<{ open: boolean }[]>(
      `SELECT school_is_active(NULL) AS open`,
    );
    const [unknown] = await owner.$queryRawUnsafe<{ open: boolean }[]>(
      `SELECT school_is_active('00000000-0000-4000-8000-000000000000'::uuid) AS open`,
    );

    expect(none.open, 'the platform operator belongs to no school and must still sign in').toBe(
      true,
    );
    expect(unknown.open, 'a school that does not exist was treated as open').toBe(false);
  });

  /** Creating a school changes nothing about what a school can see. */
  it('still shows a school only its own row', async () => {
    const seen = await forSchool(SCHOOL_A, (tx) => tx.school.findMany());

    expect(seen.map((school) => school.id)).toEqual([SCHOOL_A]);
  });

  /** And the restricted role still cannot make one for itself. */
  it('refuses a school created by the application role', async () => {
    await expect(
      forSchool(SCHOOL_A, (tx) =>
        tx.$executeRawUnsafe(`
          INSERT INTO schools (id, name, status, created_at, updated_at)
          VALUES (gen_random_uuid(), 'Isolation Test Sneak', 'ACTIVE', now(), now())
        `),
      ),
    ).rejects.toThrow();
  });
});

/**
 * The school administrator's reach, at the level of the database.
 *
 * Managing teachers is an ordinary tenant write — no privileged function, no
 * widened grant — so what confines it is the row-level policy on `users` and
 * the one on `teacher_profiles` that follows it. These check that the policies
 * really do confine it, rather than trusting that the service asked nicely.
 */
describe('a school administrator is confined to her own school', () => {
  const TEACHER_A = 'aaaaaaaa-0000-4000-8000-000000000030';
  const TEACHER_B = 'bbbbbbbb-0000-4000-8000-000000000030';
  const PUPIL_A = 'aaaaaaaa-0000-4000-8000-000000000031';

  beforeAll(async () => {
    for (const [id, schoolId, username] of [
      [TEACHER_A, SCHOOL_A, 'iso-teacher-a'],
      [TEACHER_B, SCHOOL_B, 'iso-teacher-b'],
    ] as const) {
      await owner.user.upsert({
        where: { id },
        update: {},
        create: {
          id,
          schoolId,
          role: 'TEACHER',
          username,
          passwordHash: 'x',
          teacherProfile: { create: { displayName: username } },
        },
      });
    }

    await owner.user.upsert({
      where: { id: PUPIL_A },
      update: {},
      create: {
        id: PUPIL_A,
        schoolId: SCHOOL_A,
        role: 'STUDENT',
        username: 'iso-pupil-a',
        passwordHash: 'x',
        studentProfile: { create: { fullName: 'Iso Pupil A', assignedTeacherId: TEACHER_A } },
      },
    });
  });

  afterAll(async () => {
    await owner.studentProfile.deleteMany({ where: { userId: PUPIL_A } });
    await owner.teacherProfile.deleteMany({ where: { userId: { in: [TEACHER_A, TEACHER_B] } } });
    await owner.user.deleteMany({ where: { id: { in: [TEACHER_A, TEACHER_B, PUPIL_A] } } });
  });

  it('shows a school only its own teachers', async () => {
    const seen = await forSchool(SCHOOL_A, (tx) =>
      tx.user.findMany({ where: { role: 'TEACHER' }, select: { id: true } }),
    );

    expect(seen.map((row) => row.id)).toContain(TEACHER_A);
    expect(seen.map((row) => row.id), 'another school’s teacher was visible').not.toContain(
      TEACHER_B,
    );
  });

  /**
   * The profile carries the name, and its policy is written through `users`
   * rather than on a school column of its own — so it is worth checking that
   * the indirection actually holds.
   */
  it('hides another school’s teacher profile', async () => {
    const seen = await forSchool(SCHOOL_A, (tx) =>
      tx.teacherProfile.findMany({ select: { userId: true } }),
    );

    expect(seen.map((row) => row.userId)).toContain(TEACHER_A);
    expect(seen.map((row) => row.userId)).not.toContain(TEACHER_B);
  });

  it('refuses to read another school’s teacher by id', async () => {
    const found = await forSchool(SCHOOL_A, (tx) =>
      tx.user.findFirst({ where: { id: TEACHER_B, role: 'TEACHER' } }),
    );

    expect(found, 'a teacher in another school was readable by id').toBeNull();
  });

  it('refuses to change another school’s teacher', async () => {
    const changed = await forSchool(SCHOOL_A, (tx) =>
      tx.user.updateMany({ where: { id: TEACHER_B }, data: { status: 'DISABLED' } }),
    );

    expect(changed.count).toBe(0);
    expect((await owner.user.findUniqueOrThrow({ where: { id: TEACHER_B } })).status).toBe(
      'ACTIVE',
    );
  });

  /**
   * The one write that could quietly cross a school if nothing checked it:
   * pointing a student at a teacher who belongs to somebody else. The policy
   * on `student_profiles` follows the student rather than the teacher, so the
   * database alone does not stop this — which is exactly why the service
   * looks the teacher up inside the school first, and why that is asserted
   * in `school.service.spec.ts` as well as here.
   */
  it('cannot see the teacher a cross-school assignment would need', async () => {
    const target = await forSchool(SCHOOL_A, (tx) =>
      tx.user.findFirst({
        where: { id: TEACHER_B, schoolId: SCHOOL_A, role: 'TEACHER', deletedAt: null },
        select: { id: true },
      }),
    );

    expect(target, 'the check the service makes would have found a teacher elsewhere').toBeNull();
  });

  /** And a teacher created under one school lands in that school and no other. */
  it('creates a teacher inside the school that made her', async () => {
    const made = await forSchool(SCHOOL_A, (tx) =>
      tx.user.create({
        data: {
          schoolId: SCHOOL_A,
          role: 'TEACHER',
          username: 'iso-teacher-new',
          passwordHash: 'x',
          teacherProfile: { create: { displayName: 'Iso New' } },
        },
        select: { id: true, schoolId: true },
      }),
    );

    expect(made.schoolId).toBe(SCHOOL_A);

    const fromB = await forSchool(SCHOOL_B, (tx) =>
      tx.user.findFirst({ where: { id: made.id } }),
    );
    expect(fromB, 'a new teacher was visible from another school').toBeNull();

    await owner.teacherProfile.deleteMany({ where: { userId: made.id } });
    await owner.user.delete({ where: { id: made.id } });
  });

  /**
   * A username is unique within a school, not across the platform. Two schools
   * may each have a "sara", and the administration screens must not invent a
   * stricter rule than the database keeps.
   */
  it('allows the same username in two different schools', async () => {
    const first = await owner.user.create({
      data: { schoolId: SCHOOL_A, role: 'TEACHER', username: 'iso-shared', passwordHash: 'x' },
    });
    const second = await owner.user.create({
      data: { schoolId: SCHOOL_B, role: 'TEACHER', username: 'iso-shared', passwordHash: 'x' },
    });

    expect(first.schoolId).not.toBe(second.schoolId);

    await expect(
      owner.user.create({
        data: { schoolId: SCHOOL_A, role: 'STUDENT', username: 'iso-shared', passwordHash: 'x' },
      }),
      'the same username was allowed twice inside one school',
    ).rejects.toThrow();

    await owner.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });
});
