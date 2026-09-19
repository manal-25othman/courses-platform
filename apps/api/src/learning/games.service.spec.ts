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
import { QuestionEngineService } from '../questions/question-engine.service';
import { CurrentUser } from '../auth/auth.types';
import type { SettingsService } from '../settings/settings.service';
import type { PrismaService } from '../prisma/prisma.service';

/** The real engine: a game must present and mark through the same one. */
const engine = new QuestionEngineService();
/** Nothing configured, so the adventure falls back to its own type list. */
const settings = { resolve: async () => undefined } as unknown as SettingsService;

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
  { key: 'grammar_adventure', displayName: 'Grammar Adventure', description: 'd', contentPool: 'grammar_questions', minimumItems: 3, isActive: true, orderIndex: 3 },
];

type QRow = {
  id: string;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  points: number;
  orderIndex: number;
  section: { type: { progressComponent: string } } | null;
};

/** A grammar question of a kind a thumb can answer, which is what the game takes. */
const ordering = (id: string, over: Partial<QRow> = {}): QRow => ({
  id,
  typeKey: 'word_ordering',
  prompt: 'Order the words to make a sentence',
  payload: {
    tokens: [
      { id: 't1', text: 'She' },
      { id: 't2', text: 'goes' },
      { id: 't3', text: 'home' },
    ],
  },
  points: 1,
  orderIndex: 0,
  section: { type: { progressComponent: 'grammar' } },
  ...over,
});

function serviceOver(words: Word[], unitPublished = true, questions: QRow[] = []) {
  /** Any write is a failure, so the fakes for them throw rather than record. */
  const refuse = (what: string) => () => {
    throw new Error(`a bonus game must not write: ${what}`);
  };

  const tx = {
    unit: {
      // The student's paths ask for a published unit and get nothing when it
      // is not; the teacher's readiness read asks regardless and is told which.
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        'status' in where && !unitPublished
          ? null
          : {
              id: 'u1',
              status: unitPublished ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
            },
    },
    vocabularyItem: {
      findMany: async () => words.filter((w) => w.status === ContentStatus.PUBLISHED),
      create: refuse('vocabularyItem.create'),
      update: refuse('vocabularyItem.update'),
    },
    bonusGameType: {
      findMany: async () => GAME_TYPES,
      findUnique: async ({ where }: { where: { key: string } }) =>
        GAME_TYPES.find((t) => t.key === where.key) ?? null,
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
    // Grammar Adventure reads questions; this harness holds none unless a
    // test supplies them, and writing one is refused like every other write.
    question: {
      findMany: async () => questions,
      findFirst: async () => null,
      create: refuse('question.create'),
      update: refuse('question.update'),
    },
  };

  const prisma = {
    forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PrismaService;

  return new GamesService(prisma, engine, settings);
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
    expect(games.map((g) => g.key)).toEqual(['memory_match', 'quick_match', 'grammar_adventure']);
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

/**
 * What the teacher is told about Grammar Adventure.
 *
 * The game has no content of its own: it plays the unit's published grammar
 * activities, so a teacher writing those questions is the person who switches
 * it on. Until this read existed she was never told so, and had no way to see
 * what a unit was short of.
 *
 * The danger in adding it is a second opinion. A CMS that counts questions its
 * own way will agree with the game on the day it is written and disagree the
 * first time eligibility changes -- and "ready" over a game that says "not
 * enough yet" is worse than saying nothing. So the first test here is not
 * about a number; it is that the number is the game's own.
 */
describe('the teacher is told what Grammar Adventure has to play with', () => {
  const teacher: CurrentUser = {
    sub: 't1',
    userId: 't1',
    role: UserRole.TEACHER,
    schoolId: 'school-1',
    mustChangePassword: false,
  };

  const four = [ordering('q1'), ordering('q2'), ordering('q3'), ordering('q4')];

  it('counts exactly what a round would be built from', async () => {
    /*
      The point of the whole read. A mix the game accepts in part: spelling is
      typed, so a thumb cannot answer it and the game leaves it out. If this
      count were written separately it would say five.
    */
    const mixed = [
      ordering('q1'),
      ordering('q2', { typeKey: 'spelling', payload: { mediaId: 'm1' } }),
      ordering('q3'),
      ordering('q4', { typeKey: 'grammar_transformation' }),
      ordering('q5'),
    ];
    const service = serviceOver(SIX, true, mixed);

    const readiness = await service.adventureReadiness(teacher, 'u1');
    const round = await service.adventureRound(student, 'u1');

    expect(readiness.usable).toBe(3);
    expect(readiness.usable).toBe(round.checkpoints.length);
  });

  it('says a unit is ready once it has the minimum', async () => {
    const readiness = await serviceOver(SIX, true, four).adventureReadiness(teacher, 'u1');
    expect(readiness).toMatchObject({ usable: 4, minimum: 3, ready: true });
  });

  it('says a unit is short, and by how much, rather than hiding the game', async () => {
    // Two questions is the case a teacher actually hits, and the one she can
    // do something about -- if she is told the target.
    const readiness = await serviceOver(SIX, true, [ordering('q1'), ordering('q2')])
      .adventureReadiness(teacher, 'u1');

    expect(readiness).toMatchObject({ usable: 2, minimum: 3, ready: false });
  });

  it('answers for a draft unit, and says it is a draft', async () => {
    // A teacher preparing a unit is exactly who needs this, so unlike the
    // student's listing it does not insist on a published unit.
    const readiness = await serviceOver(SIX, false, four).adventureReadiness(teacher, 'u1');

    expect(readiness).toMatchObject({ usable: 4, ready: true, unitPublished: false });
  });

  it('is not ready when the game itself is switched off', async () => {
    const service = serviceOver(SIX, true, four);
    const off = GAME_TYPES.find((t) => t.key === 'grammar_adventure')!;
    off.isActive = false;
    try {
      const readiness = await service.adventureReadiness(teacher, 'u1');
      // Enough questions, but nothing to play them in. Saying "ready" here
      // would send a teacher looking for a game her students cannot see.
      expect(readiness).toMatchObject({ usable: 4, ready: false, gameActive: false });
    } finally {
      off.isActive = true;
    }
  });

  it('writes nothing, like every other game path', async () => {
    // The harness throws on any write, so reaching the end is the assertion.
    await expect(
      serviceOver(SIX, true, four).adventureReadiness(teacher, 'u1'),
    ).resolves.toMatchObject({ ready: true });
  });

  it('refuses an account with no school', async () => {
    await expect(
      serviceOver(SIX, true, four).adventureReadiness({ ...teacher, schoolId: null }, 'u1'),
    ).rejects.toThrow(/not attached to a school/i);
  });
});
