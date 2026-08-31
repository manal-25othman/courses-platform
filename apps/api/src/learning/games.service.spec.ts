/**
 * What a bonus game must never do matters more than what it does.
 *
 * The client's rule is that games count for nothing: no attempt recorded, no
 * progress moved, no assessment try spent, no score changed. The strongest way
 * to test that is to give the service a database that throws if anything is
 * written, and then play.
 */
import { describe, expect, it } from 'vitest';
import { ContentStatus, UserRole } from '@prisma/client';
import { GamesService } from './games.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';

const student: CurrentUser = {
  sub: 's1',
  userId: 's1',
  role: UserRole.STUDENT,
  schoolId: 'school-1',
  mustChangePassword: false,
};

type Word = { id: string; wordEn: string; meaningAr: string | null; status: ContentStatus };

const published = (id: string, en: string, ar: string | null): Word => ({
  id,
  wordEn: en,
  meaningAr: ar,
  status: ContentStatus.PUBLISHED,
});

const GAME_TYPES = [
  { key: 'memory_match', displayName: 'Memory Match', description: 'd', contentPool: 'vocabulary', minimumItems: 6, isActive: true, orderIndex: 1 },
  { key: 'quick_match', displayName: 'Quick Match', description: 'd', contentPool: 'vocabulary', minimumItems: 4, isActive: true, orderIndex: 2 },
];

function serviceOver(words: Word[], unitPublished = true) {
  /** Any write is a failure, so the fakes for them throw rather than record. */
  const refuse = (what: string) => () => {
    throw new Error(`a bonus game must not write: ${what}`);
  };

  const tx = {
    unit: {
      findFirst: async () => (unitPublished ? { id: 'u1' } : null),
    },
    vocabularyItem: {
      findMany: async () => words.filter((w) => w.status === ContentStatus.PUBLISHED),
      create: refuse('vocabularyItem.create'),
      update: refuse('vocabularyItem.update'),
    },
    bonusGameType: {
      findMany: async () => GAME_TYPES,
      findFirst: async ({ where }: { where: { key: string } }) =>
        GAME_TYPES.find((t) => t.key === where.key) ?? null,
    },
    activityAttempt: {
      create: refuse('activityAttempt.create'),
      update: refuse('activityAttempt.update'),
      findFirst: refuse('activityAttempt.findFirst'),
    },
    vocabularyProgress: { create: refuse('vocabularyProgress.create'), update: refuse('vocabularyProgress.update') },
    sectionProgress: { create: refuse('sectionProgress.create') },
    attemptAnswer: { create: refuse('attemptAnswer.create'), update: refuse('attemptAnswer.update') },
  };

  const prisma = {
    forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PrismaService;

  return new GamesService(prisma);
}

const SIX = [
  published('1', 'lion', 'أسد'),
  published('2', 'camel', 'جمل'),
  published('3', 'eagle', 'نسر'),
  published('4', 'swan', 'بجعة'),
  published('5', 'nest', 'عش'),
  published('6', 'pond', 'بركة'),
];

describe('bonus games record nothing', () => {
  it('lists games without writing anything', async () => {
    const games = await serviceOver(SIX).listForUnit(student, 'u1');
    expect(games.map((g) => g.key)).toEqual(['memory_match', 'quick_match']);
  });

  it('plays a memory round without writing anything', async () => {
    const round = await serviceOver(SIX).round(student, 'u1', 'memory_match');
    expect(round.pairs.length).toBe(6);
  });

  it('plays a quick round without writing anything', async () => {
    const round = await serviceOver(SIX).round(student, 'u1', 'quick_match');
    expect(round.questions.length).toBe(6);
  });
});

describe('bonus games invent nothing', () => {
  it('offers only real meanings from the same unit as wrong answers', async () => {
    const real = new Set(SIX.map((w) => w.meaningAr));
    const round = await serviceOver(SIX).round(student, 'u1', 'quick_match');

    for (const q of round.questions) {
      for (const option of q.options) expect(real.has(option)).toBe(true);
    }
  });

  it('always includes the right answer among the options', async () => {
    const round = await serviceOver(SIX).round(student, 'u1', 'quick_match');
    for (const q of round.questions) expect(q.options).toContain(q.answer);
  });

  it('never offers the same meaning twice in one question', async () => {
    // Two words can share a meaning; offering the right answer twice would
    // make the question unanswerable.
    const shared = [...SIX, published('7', 'large', 'كبير'), published('8', 'big', 'كبير')];
    const round = await serviceOver(shared).round(student, 'u1', 'quick_match');

    for (const q of round.questions) {
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it('leaves out a word that has no meaning rather than showing a blank card', async () => {
    const withGap = [...SIX, published('9', 'orphan', null)];
    const round = await serviceOver(withGap).round(student, 'u1', 'memory_match');

    expect(round.pairs.map((p) => p.wordEn)).not.toContain('orphan');
  });
});

describe('bonus games see only what a student may see', () => {
  it('ignores draft vocabulary', async () => {
    const mixed = [...SIX, { ...published('9', 'secret', 'سر'), status: ContentStatus.DRAFT }];
    const round = await serviceOver(mixed).round(student, 'u1', 'memory_match');

    expect(round.pairs.map((p) => p.wordEn)).not.toContain('secret');
  });

  it('refuses a unit that is not published', async () => {
    await expect(serviceOver(SIX, false).listForUnit(student, 'u1')).rejects.toThrow(/not found/i);
  });

  it('marks a game unavailable when the unit has too few words', async () => {
    const games = await serviceOver(SIX.slice(0, 4)).listForUnit(student, 'u1');

    expect(games.find((g) => g.key === 'memory_match')?.available).toBe(false);
    expect(games.find((g) => g.key === 'quick_match')?.available).toBe(true);
  });

  it('refuses to deal a round it does not have the words for', async () => {
    await expect(
      serviceOver(SIX.slice(0, 4)).round(student, 'u1', 'memory_match'),
    ).rejects.toThrow(/enough words/i);
  });
});
