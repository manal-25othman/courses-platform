/**
 * The rule that two usernames differing only in capitals are one username.
 *
 * Stated in one module because it has to hold in three places that cannot see
 * each other: signing in, creating an account, and a unique index in the
 * database. These pin the shared half; the service tests pin the use of it,
 * and the migration pins the database's.
 *
 * The negative cases matter as much as the positive ones. The brief asked for
 * usernames to stop being case-sensitive, and the way that goes wrong is by
 * quietly taking passwords with it.
 */
import { describe, expect, it } from 'vitest';
import { sameUsername, storedUsername, usernameKey } from './username';

describe('two usernames are the same name whatever the capitals', () => {
  it('matches the three spellings the client named', () => {
    // Verbatim from the requirement: Teacher, teacher, TEACHER.
    expect(sameUsername('Teacher', 'teacher')).toBe(true);
    expect(sameUsername('TEACHER', 'teacher')).toBe(true);
    expect(sameUsername('Teacher', 'TEACHER')).toBe(true);
  });

  it('still tells genuinely different names apart', () => {
    expect(sameUsername('sara', 'sarah')).toBe(false);
    expect(sameUsername('sara.q', 'sara_q')).toBe(false);
    expect(sameUsername('noura1', 'noura2')).toBe(false);
  });

  it('ignores space around a name, which is never part of it', () => {
    // A username pasted from a list arrives with a trailing space, and an
    // account stored with one cannot be signed in to without knowing it.
    expect(sameUsername(' sara ', 'sara')).toBe(true);
    expect(usernameKey('  Sara.Q  ')).toBe('sara.q');
  });

  it('does not fold space inside a name away', () => {
    // Only the ends. "sara q" and "saraq" are different names.
    expect(sameUsername('sara q', 'saraq')).toBe(false);
  });

  /**
   * The one that would only ever fail on somebody else's server.
   *
   * Under a Turkish locale `toLocaleLowerCase` maps "I" to a dotless "ı", so
   * "ISRA" and "isra" would compare equal in one place and not in another.
   * A username whose identity depends on where the server is standing is not
   * an identity.
   */
  it('lowercases the same way everywhere, not the local way', () => {
    expect(usernameKey('ISRA')).toBe('isra');
    expect(sameUsername('ISRA', 'isra')).toBe(true);
    expect(usernameKey('I')).toBe('i');
  });
});

describe('a name is stored the way it was typed', () => {
  it('keeps her capitals', () => {
    // She sees her own username back on her account page. Lowercasing on the
    // way in would rename every account to solve a matching problem that
    // matching already solves.
    expect(storedUsername('Sara.Q')).toBe('Sara.Q');
    expect(storedUsername('TEACHER')).toBe('TEACHER');
  });

  it('drops only the space around it', () => {
    expect(storedUsername('  Sara.Q  ')).toBe('Sara.Q');
  });
});

describe('nothing but usernames is affected', () => {
  /*
    Not a test of the password code -- a test that this module offers nothing
    that could be pointed at a password. It exports a comparison and a
    trimmer, and neither is reachable from hashing or verification: the
    password path imports none of this. Stated as a test because "we did not
    accidentally make passwords case-insensitive" is the kind of thing that is
    true until someone reuses a helper for tidiness.
  */
  it('offers no comparison that would suit a secret', async () => {
    const exported = await import('./username');
    expect(Object.keys(exported).sort()).toEqual([
      'sameUsername',
      'storedUsername',
      'usernameKey',
    ]);
  });

  it('is case-preserving, so it cannot be used to normalise a secret', () => {
    // storedUsername is the only thing written to the database, and it leaves
    // case alone. Anything hashing its output would still hash exact case.
    const secret = 'CorrectHorse9';
    expect(storedUsername(secret)).toBe(secret);
  });
});
