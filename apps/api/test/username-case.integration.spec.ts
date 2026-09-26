import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Proves a username is matched whatever the capitals, and a password is not.
 *
 * This runs against a real PostgreSQL because the rule lives there: signing in
 * goes through `auth_find_users_by_username`, a database function, and the
 * only way to know what it matches on is to ask it. A mock would prove the
 * test's own assumptions and nothing else -- which is exactly how a fault like
 * this one hides, since the application code either side of the function was
 * correct all along.
 *
 * It builds its own school and its own account, and deletes both afterwards.
 * It never touches an account it did not create.
 *
 *   OWNER_DATABASE_URL (or DIRECT_URL) - the owner, for the fixtures
 */
const OWNER_URL = process.env.OWNER_DATABASE_URL ?? process.env.DIRECT_URL;

const SCHOOL = 'cae50000-0000-4000-8000-000000000001';
const STUDENT = 'cae50000-0000-4000-8000-000000000002';

// Stored with a capital, which is the shape a tablet's keyboard produces and
// the reason any of this matters.
const USERNAME = 'Student2';
const PASSWORD = 'Correct-Horse-9';

const owner = new PrismaClient({ datasourceUrl: OWNER_URL });

/** What the sign-in lookup answers for one spelling. */
async function lookup(spelling: string): Promise<{ id: string; username: string }[]> {
  return owner.$queryRawUnsafe(
    `SELECT id, username FROM auth_find_users_by_username($1, NULL)`,
    spelling,
  );
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `INSERT INTO schools (id, name, status, created_at, updated_at)
     VALUES ($1::uuid, 'Username Case Fixture', 'ACTIVE', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    SCHOOL,
  );

  await owner.$executeRawUnsafe(
    `INSERT INTO users (id, school_id, role, username, password_hash, must_change_password,
                        status, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'STUDENT', $3, $4, false, 'ACTIVE', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    STUDENT,
    SCHOOL,
    USERNAME,
    await argon2.hash(PASSWORD, { type: argon2.argon2id }),
  );
});

afterAll(async () => {
  await owner.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, STUDENT);
  await owner.$executeRawUnsafe(`DELETE FROM schools WHERE id = $1::uuid`, SCHOOL);
  await owner.$disconnect();
});

describe('a username is the same name whatever the capitals', () => {
  it('finds her when it is typed in lower case', async () => {
    const found = await lookup('student2');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(STUDENT);
  });

  it('finds her when it is typed in upper case', async () => {
    const found = await lookup('STUDENT2');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(STUDENT);
  });

  it('finds her when it is typed the way it is stored', async () => {
    const found = await lookup(USERNAME);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(STUDENT);
  });

  it('finds her when the capitals are all over the place', async () => {
    const found = await lookup('sTuDeNt2');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(STUDENT);
  });

  it('gives back the spelling she is stored under, not the one that was typed', async () => {
    // Her own screens show her name as she was given it.
    const found = await lookup('STUDENT2');
    expect(found[0].username).toBe(USERNAME);
  });

  it('finds her with the surrounding space a paste leaves behind', async () => {
    const found = await lookup('  student2  ');
    expect(found).toHaveLength(1);
  });

  it('finds nobody for a username that does not exist', async () => {
    expect(await lookup('student3')).toHaveLength(0);
    expect(await lookup('Student22')).toHaveLength(0);
  });
});

describe('a password is not', () => {
  it('accepts the password exactly as it was set', async () => {
    const [row] = await owner.$queryRawUnsafe<{ password_hash: string }[]>(
      `SELECT password_hash FROM users WHERE id = $1::uuid`,
      STUDENT,
    );

    expect(await argon2.verify(row.password_hash, PASSWORD)).toBe(true);
  });

  it('refuses the same password in capitals', async () => {
    const [row] = await owner.$queryRawUnsafe<{ password_hash: string }[]>(
      `SELECT password_hash FROM users WHERE id = $1::uuid`,
      STUDENT,
    );

    expect(await argon2.verify(row.password_hash, PASSWORD.toUpperCase())).toBe(false);
    expect(await argon2.verify(row.password_hash, PASSWORD.toLowerCase())).toBe(false);
  });
});

describe('two names differing only in capitals cannot both exist', () => {
  it('refuses a second account whose name differs only in case', async () => {
    // The index the migration added is what holds this, and it is what makes
    // the case-insensitive lookup safe: two matches would be read as
    // "ambiguous" and would lock out both girls rather than neither.
    const second = 'cae50000-0000-4000-8000-000000000003';

    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO users (id, school_id, role, username, password_hash, must_change_password,
                            status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'STUDENT', 'STUDENT2', 'x', false, 'ACTIVE', now(), now())`,
        second,
        SCHOOL,
      ),
    ).rejects.toThrow();

    await owner.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, second);
  });
});
