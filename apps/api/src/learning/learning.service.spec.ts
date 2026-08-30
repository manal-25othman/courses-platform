import { describe, expect, it, vi } from 'vitest';
import { AttemptStatus, ContentStatus, UserRole } from '@prisma/client';
import { LearningService } from './learning.service';
import { QuestionEngineService } from '../questions/question-engine.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { SETTING_KEYS } from '../settings/settings.types';

const SCHOOL = 'school-1';
const STUDENT_ID = 'student-1';

const student: CurrentUser = {
  sub: STUDENT_ID,
  userId: STUDENT_ID,
  role: UserRole.STUDENT,
  schoolId: SCHOOL,
  mustChangePassword: false,
};

const teacher: CurrentUser = { ...student, role: UserRole.TEACHER, userId: 't1', sub: 't1' };

/** The settings this client confirmed, unless a test overrides one. */
const CONFIRMED: Record<string, unknown> = {
  [SETTING_KEYS.VOCABULARY_COMPLETION_RULE]: 'seen_and_audio_played',
  [SETTING_KEYS.ACTIVITY_MAX_ATTEMPTS]: null,
  [SETTING_KEYS.ASSESSMENT_RESULT_POLICY]: 'highest',
  [SETTING_KEYS.PROGRESS_WEIGHTS]: {
    vocabulary: 25,
    grammar: 25,
    activity: 25,
    assessment: 25,
  },
  [SETTING_KEYS.RANDOMIZATION_SHUFFLE_QUESTIONS]: true,
  [SETTING_KEYS.RANDOMIZATION_SHUFFLE_OPTIONS]: true,
};

function settingsWith(overrides: Record<string, unknown> = {}): SettingsService {
  const values = { ...CONFIRMED, ...overrides };
  return {
    resolve: async (key: string) => values[key],
    require: async (key: string) => values[key],
  } as unknown as SettingsService;
}

interface Tables {
  vocabularyItem?: { id: string; status: ContentStatus }[];
  vocabularyProgress?: Record<string, unknown>[];
  unitSection?: { id: string; type: { progressComponent: string | null } }[];
  sectionProgress?: Record<string, unknown>[];
  questions?: number;
  attempts?: { scorePercent: number | null }[];
}

/** An in-memory stand-in, so these run without a database. */
function serviceOver(tables: Tables, overrides: Record<string, unknown> = {}) {
  const vocabProgress = [...(tables.vocabularyProgress ?? [])];

  const tx = {
    unit: {
      findFirst: async ({ where }: { where: { status?: ContentStatus } }) =>
        where.status === ContentStatus.PUBLISHED ? { id: 'u1', title: 'Unit', status: where.status } : null,
      findMany: async () => [{ id: 'u1', title: 'Unit', orderIndex: 0, description: null }],
    },
    vocabularyItem: {
      findMany: async () => tables.vocabularyItem ?? [],
      findFirst: async ({ where }: { where: { id: string; status?: ContentStatus } }) =>
        (tables.vocabularyItem ?? []).find(
          (v) => v.id === where.id && v.status === ContentStatus.PUBLISHED,
        ) ?? null,
    },
    vocabularyProgress: {
      findMany: async () => vocabProgress,
      findFirst: async ({ where }: { where: { itemId: string } }) =>
        vocabProgress.find((p) => p.itemId === where.itemId) ?? null,
      count: async ({ where }: { where: { learnedAt?: unknown } }) =>
        vocabProgress.filter((p) => (where.learnedAt ? p.learnedAt !== null : true)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `vp-${vocabProgress.length}`, ...data };
        vocabProgress.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const i = vocabProgress.findIndex((p) => p.id === where.id);
        vocabProgress[i] = { ...vocabProgress[i], ...data };
        return vocabProgress[i];
      },
    },
    unitSection: {
      findMany: async () => tables.unitSection ?? [],
      findFirst: async () => null,
    },
    sectionProgress: {
      findMany: async () => tables.sectionProgress ?? [],
      findFirst: async () => null,
      count: async () => (tables.sectionProgress ?? []).length,
      create: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    question: { count: async () => tables.questions ?? 0, findMany: async () => [] },
    activityAttempt: {
      findMany: async () => tables.attempts ?? [],
      findFirst: async () => null,
      count: async () => (tables.attempts ?? []).length,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...data }),
      findUnique: async () => ({ id: 'a1', unitId: 'u1', status: AttemptStatus.IN_PROGRESS, startedAt: new Date(), answers: [] }),
      update: async () => ({}),
    },
    attemptAnswer: { create: async () => ({}), update: async () => ({}) },
  };

  const prisma = {
    forSchool: async <T>(_school: string, work: (t: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PrismaService;

  return new LearningService(prisma, settingsWith(overrides), new QuestionEngineService());
}

describe('LearningService vocabulary completion (SRS 22)', () => {
  const item = [{ id: 'w1', status: ContentStatus.PUBLISHED }];

  /**
   * The rule the client confirmed: seeing a word is not learning it. This is
   * the one that would be easiest to get wrong by treating the card opening
   * as completion.
   */
  it('does not count a word as learned from being seen alone', async () => {
    const service = serviceOver({ vocabularyItem: item });

    const progress = await service.markVocabulary(student, 'w1', 'seen');

    expect((progress as { seenAt: Date | null }).seenAt).not.toBeNull();
    expect((progress as { learnedAt: Date | null }).learnedAt).toBeNull();
  });

  it('does not count a word as learned from audio alone', async () => {
    const service = serviceOver({ vocabularyItem: item });

    const progress = await service.markVocabulary(student, 'w1', 'audio');

    expect((progress as { learnedAt: Date | null }).learnedAt).toBeNull();
  });

  it('counts it as learned once she has both seen and heard it', async () => {
    const service = serviceOver({ vocabularyItem: item });

    await service.markVocabulary(student, 'w1', 'seen');
    const progress = await service.markVocabulary(student, 'w1', 'audio');

    expect((progress as { learnedAt: Date | null }).learnedAt).not.toBeNull();
  });

  it('does not care which order she does them in', async () => {
    const service = serviceOver({ vocabularyItem: item });

    await service.markVocabulary(student, 'w1', 'audio');
    const progress = await service.markVocabulary(student, 'w1', 'seen');

    expect((progress as { learnedAt: Date | null }).learnedAt).not.toBeNull();
  });

  /** The rule is configurable, so a different setting must actually change it. */
  it('follows a configured rule of seen-only', async () => {
    const service = serviceOver(
      { vocabularyItem: item },
      { [SETTING_KEYS.VOCABULARY_COMPLETION_RULE]: 'seen_only' },
    );

    const progress = await service.markVocabulary(student, 'w1', 'seen');

    expect((progress as { learnedAt: Date | null }).learnedAt).not.toBeNull();
  });

  /** An unreadable value must not make words easier to complete. */
  it('falls back to the stricter reading when the rule is unrecognised', async () => {
    const service = serviceOver(
      { vocabularyItem: item },
      { [SETTING_KEYS.VOCABULARY_COMPLETION_RULE]: 'something_new' },
    );

    const progress = await service.markVocabulary(student, 'w1', 'seen');

    expect((progress as { learnedAt: Date | null }).learnedAt).toBeNull();
  });

  it('refuses to record progress against an unpublished word', async () => {
    const service = serviceOver({
      vocabularyItem: [{ id: 'w1', status: ContentStatus.DRAFT }],
    });

    await expect(service.markVocabulary(student, 'w1', 'seen')).rejects.toThrow(/not found/i);
  });
});

describe('LearningService progress (SRS 16, 21)', () => {
  it('reports each part and a weighted total', async () => {
    const service = serviceOver({
      vocabularyItem: [
        { id: 'w1', status: ContentStatus.PUBLISHED },
        { id: 'w2', status: ContentStatus.PUBLISHED },
      ],
      vocabularyProgress: [{ id: 'p1', itemId: 'w1', learnedAt: new Date() }],
      unitSection: [{ id: 's1', type: { progressComponent: 'grammar' } }],
      sectionProgress: [{ sectionId: 's1' }],
      questions: 5,
      attempts: [{ scorePercent: 60 }],
    });

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.vocabulary).toEqual({ total: 2, done: 1, percent: 50 });
    expect(progress.grammar).toEqual({ total: 1, done: 1, percent: 100 });
    expect(progress.activity.percent).toBe(100);
    // (50 + 100 + 100) / 3 components of equal weight
    expect(progress.overallPercent).toBe(83);
  });

  /**
   * Assessments are Phase 6. Counting their weight as zero would make a
   * finished unit look unfinished, and counting it as done would be untrue —
   * so it is named instead.
   */
  it('names the parts it cannot measure rather than guessing at them', async () => {
    const service = serviceOver({ questions: 1 });

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.notCounted).toEqual(['assessment']);
  });

  it('takes her best score, not her latest, when the policy says highest', async () => {
    const service = serviceOver({ attempts: [{ scorePercent: 80 }, { scorePercent: 40 }] });

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.bestScorePercent).toBe(80);
    expect(progress.attemptsTaken).toBe(2);
  });

  it('takes her latest when the policy says so', async () => {
    const service = serviceOver(
      { attempts: [{ scorePercent: 80 }, { scorePercent: 40 }] },
      { [SETTING_KEYS.ASSESSMENT_RESULT_POLICY]: 'latest' },
    );

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.bestScorePercent).toBe(40);
  });

  /**
   * Which sections count is data on the section type, not a key written into
   * this file, because the client has not settled which parts of this
   * curriculum belong to the four-component model.
   */
  it('counts only the section kinds marked as counting towards grammar', async () => {
    const service = serviceOver({
      unitSection: [
        { id: 's1', type: { progressComponent: 'grammar' } },
        { id: 's2', type: { progressComponent: null } },
        { id: 's3', type: { progressComponent: null } },
      ],
      sectionProgress: [{ sectionId: 's1' }],
    });

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.grammar.total).toBe(1);
  });

  it('treats a part with nothing in it as nothing left to do', async () => {
    const service = serviceOver({});

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.vocabulary.percent).toBe(100);
    expect(progress.grammar.percent).toBe(100);
  });
});

/**
 * The rule that keeps a student's marks stable while her curriculum is being
 * corrected: an attempt is marked from the copy frozen into it, never from the
 * question as it stands now.
 *
 * The stand-in below makes the two disagree on purpose — the live question says
 * "b" is right, the frozen copy says "a" — so marking against the wrong one is
 * impossible to miss.
 */
describe('LearningService marks from the frozen copy, not the live question', () => {
  const SNAPSHOT = {
    questionId: 'q1',
    typeKey: 'multiple_choice',
    prompt: 'The question as she was asked it',
    payload: { options: [{ id: 'a', text: 'first' }, { id: 'b', text: 'second' }] },
    answerKey: { correctOptionId: 'a' },
    points: 1,
    capturedAt: new Date().toISOString(),
  };

  function serviceWithDivergentQuestion() {
    const updates: Record<string, unknown>[] = [];
    const attempt = {
      id: 'att1',
      unitId: 'u1',
      studentId: STUDENT_ID,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      submittedAt: null,
      correctCount: null,
      incorrectCount: null,
      pointsAwarded: null,
      pointsAvailable: null,
      scorePercent: null,
      answers: [
        {
          id: 'ans1',
          orderIndex: 0,
          snapshot: SNAPSHOT,
          response: null,
          isCorrect: null,
          pointsAwarded: null,
        },
      ],
    };

    const tx = {
      activityAttempt: {
        findFirst: async () => (attempt.status === AttemptStatus.IN_PROGRESS ? attempt : null),
        findUnique: async () => ({
          ...attempt,
          status: AttemptStatus.SUBMITTED,
          correctCount: 1,
          incorrectCount: 0,
          pointsAwarded: 1,
          pointsAvailable: 1,
          scorePercent: 100,
          answers: attempt.answers,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return attempt;
        },
      },
      attemptAnswer: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return data;
        },
      },
      // The live question now says something different. Nothing may read it.
      question: {
        findMany: async () => [
          {
            id: 'q1',
            typeKey: 'multiple_choice',
            prompt: 'The question after the teacher corrected it',
            payload: { options: [{ id: 'a', text: 'first' }, { id: 'b', text: 'second' }] },
            answerKey: { correctOptionId: 'b' },
            points: 1,
          },
        ],
        count: async () => 1,
      },
    };

    const prisma = {
      forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
    } as unknown as PrismaService;

    return {
      service: new LearningService(prisma, settingsWith(), new QuestionEngineService()),
      updates,
    };
  }

  it('marks the answer the frozen copy calls correct', async () => {
    const { service, updates } = serviceWithDivergentQuestion();

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'a' } });

    const answerUpdate = updates.find((u) => 'isCorrect' in u);
    expect(answerUpdate?.isCorrect).toBe(true);
  });

  it('marks the answer the corrected question would call correct as wrong', async () => {
    const { service, updates } = serviceWithDivergentQuestion();

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'b' } });

    const answerUpdate = updates.find((u) => 'isCorrect' in u);
    expect(answerUpdate?.isCorrect).toBe(false);
  });

  it('shows her the wording she was given, not the corrected wording', async () => {
    const { service } = serviceWithDivergentQuestion();

    const result = await service.submitActivity(student, 'att1', { ans1: { optionId: 'a' } });

    expect(result.questions[0].prompt).toBe('The question as she was asked it');
  });

  it('scores the attempt from the frozen marks', async () => {
    const { service, updates } = serviceWithDivergentQuestion();

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'a' } });

    const attemptUpdate = updates.find((u) => 'scorePercent' in u);
    expect(attemptUpdate?.scorePercent).toBe(100);
    expect(attemptUpdate?.correctCount).toBe(1);
  });

  it('treats no answer as wrong rather than failing', async () => {
    const { service, updates } = serviceWithDivergentQuestion();

    await service.submitActivity(student, 'att1', {});

    const answerUpdate = updates.find((u) => 'isCorrect' in u);
    expect(answerUpdate?.isCorrect).toBe(false);
  });
});

describe('LearningService access', () => {
  it('refuses a teacher, who has her own preview', async () => {
    const service = serviceOver({});

    await expect(service.listUnits(teacher)).rejects.toThrow(/for students/i);
  });

  it('refuses an account with no school', async () => {
    const service = serviceOver({});

    await expect(
      service.unitProgress({ ...student, schoolId: null }, 'u1'),
    ).rejects.toThrow(/not attached to a school/i);
  });

  it('does not serve an unpublished unit', async () => {
    const service = serviceOver({});
    const spy = vi.fn();

    await service.getUnit(student, 'u1').catch(spy);

    // The stand-in returns a unit only when the filter asks for PUBLISHED, so
    // reaching this point at all proves the filter was applied.
    expect(spy).not.toHaveBeenCalled();
  });
});
