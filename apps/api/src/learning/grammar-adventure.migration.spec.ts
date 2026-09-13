/**
 * The migration that makes Grammar Adventure exist.
 *
 * This file is here because of a real failure, not a hypothetical one. The
 * game was built, tested and deployed, and no student could see it: the API
 * lists whatever rows `bonus_game_types` holds, production had never run the
 * migration that adds the row, and a missing row looks exactly like a game
 * that was never written.
 *
 * Two things are checked, and both are about the row surviving:
 *
 *  1. The registry row is seeded, with the minimum the planner actually uses.
 *     Delete the INSERT and the game disappears from every school at once,
 *     with nothing failing anywhere else.
 *
 *  2. The migration writes to nothing but that registry. An earlier draft also
 *     seeded a GLOBAL row into `settings`; that table is under FORCE ROW LEVEL
 *     SECURITY and its insert policy admits only `scope = 'SCHOOL'`, so a
 *     managed-Postgres migration role — an owner, but not a superuser — is
 *     refused and the whole migration rolls back, taking the registry row with
 *     it. It passed locally because a local superuser bypasses FORCE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ELIGIBLE_TYPES, MINIMUM_CHECKPOINTS } from './grammar-adventure';

const sql = readFileSync(
  join(__dirname, '../../prisma/migrations/20260913000000_grammar_adventure/migration.sql'),
  'utf8',
);

/** Statements, with comments stripped, so prose about SQL is not read as SQL. */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('the Grammar Adventure migration', () => {
  it('seeds the registry row the API lists games from', () => {
    expect(statements).toMatch(/INSERT INTO "bonus_game_types"/);
    expect(statements).toContain("'grammar_adventure'");
    expect(statements).toContain("'Grammar Adventure'");
  });

  it('points the row at the grammar pool, not the vocabulary one', () => {
    // `content_pool` is what makes listForUnit count grammar questions for
    // this game and words for the other two.
    expect(statements).toContain("'grammar_questions'");
    expect(statements).not.toMatch(/'grammar_adventure',[\s\S]{0,300}'vocabulary'/);
  });

  it('sets the same minimum the planner refuses to go below', () => {
    // A registry minimum under MINIMUM_CHECKPOINTS would offer a game that
    // then refuses to deal a round.
    const row = /'grammar_questions',\s*(\d+)/.exec(statements);
    expect(row).not.toBeNull();
    expect(Number(row![1])).toBe(MINIMUM_CHECKPOINTS);
  });

  it('is active, so the row is actually listed', () => {
    expect(statements).toMatch(/'grammar_questions',\s*\d+,\s*true/);
  });

  it('can be run twice without failing', () => {
    expect(statements).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
  });

  it('writes to no table but the registry', () => {
    // Every INSERT in the file must target bonus_game_types. `settings` in
    // particular is fatal here: see the note at the top.
    const targets = [...statements.matchAll(/INSERT\s+INTO\s+"?(\w+)"?/gi)].map((m) => m[1]);
    expect(targets).toEqual(['bonus_game_types']);
    expect(statements).not.toMatch(/"settings"/);
  });

  it('needs no settings row, because the game falls back on its own list', () => {
    // The reason it is safe for the migration to write nothing to `settings`.
    expect(DEFAULT_ELIGIBLE_TYPES.length).toBeGreaterThan(0);
    expect(DEFAULT_ELIGIBLE_TYPES).toContain('complete_sentence');
  });
});
