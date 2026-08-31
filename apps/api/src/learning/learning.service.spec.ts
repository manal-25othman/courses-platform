import { describe, expect, it, vi } from 'vitest';
import { AttemptStatus, ContentStatus, QuestionPurpose, UserRole } from '@prisma/client';
import { LearningService } from './learning.service';
import { QuestionEngineService } from '../questions/question-engine.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { SETTING_KEYS } from '../settings/settings.types';
import { AudioSource } from './dto/learning.dto';

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
  [SETTING_KEYS.VOCABULARY_COMPLETION_RULE]: 'seen_audio_and_checked',
  [SETTING_KEYS.ACTIVITY_MAX_ATTEMPTS]: null,
  [SETTING_KEYS.ASSESSMENT_PASSING_SCORE]: 80,
  [SETTING_KEYS.ASSESSMENT_MAX_ATTEMPTS]: 2,
  [SETTING_KEYS.ASSESSMENT_RESULT_POLICY]: 'highest',
  [SETTING_KEYS.PROGRESS_WEIGHTS]: {
    vocabulary: 25,
    grammar: 25,
    activity: 25,
    assessment: 25,
  },
  [SETTING_KEYS.PROGRESS_EMPTY_COUNTS_AS_COMPLETE]: false,
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
  vocabularyItem?: {
    id: string;
    status: ContentStatus;
    wordEn?: string;
    meaningAr?: string | null;
    unitId?: string;
    /** Files the teacher attached. A recording is the audio fallback. */
    media?: { url: string; mimeType: string }[];
  }[];
  vocabularyProgress?: Record<string, unknown>[];
  unitSection?: { id: string; type: { progressComponent: string | null } }[];
  sectionProgress?: Record<string, unknown>[];
  questions?: number;
  attempts?: { scorePercent: number | null }[];
  /** The unit's assessment: how many questions, and her tries at it. */
  assessmentQuestions?: number;
  assessmentAttempts?: { scorePercent: number | null; passed: boolean | null }[];
  countsTowardCompletion?: boolean;
}

/** An in-memory stand-in, so these run without a database. */
function serviceOver(tables: Tables, overrides: Record<string, unknown> = {}) {
  const vocabProgress = [...(tables.vocabularyProgress ?? [])];

  const tx = {
    unit: {
      findFirst: async ({ where }: { where: { status?: ContentStatus } }) =>
        where.status === ContentStatus.PUBLISHED ? { id: 'u1', title: 'Unit', status: where.status } : null,
      findMany: async () => [{ id: 'u1', title: 'Unit', orderIndex: 0, description: null }],
      findUnique: async () => ({
        countsTowardCompletion: tables.countsTowardCompletion ?? true,
      }),
    },
    vocabularyItem: {
      findMany: async () => tables.vocabularyItem ?? [],
      findFirst: async ({ where }: { where: { id: string; status?: ContentStatus } }) => {
        const found = (tables.vocabularyItem ?? []).find(
          (v) => v.id === where.id && v.status === ContentStatus.PUBLISHED,
        );
        // The service reads `media` to find a teacher's recording.
        return found ? { ...found, media: found.media ?? [] } : null;
      },
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
    question: {
      // The two pools are counted separately, so the fake has to tell them
      // apart the same way the service does.
      count: async ({ where }: { where: { purpose?: QuestionPurpose } }) =>
        where.purpose === QuestionPurpose.ASSESSMENT
          ? (tables.assessmentQuestions ?? 0)
          : (tables.questions ?? 0),
      findMany: async () => [],
    },
    activityAttempt: {
      findMany: async ({ where }: { where: { purpose?: QuestionPurpose } }) =>
        where.purpose === QuestionPurpose.ASSESSMENT
          ? (tables.assessmentAttempts ?? [])
          : (tables.attempts ?? []),
      findFirst: async () => null,
      count: async () => (tables.attempts ?? []).length,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...data }),
      findUnique: async () => ({
        id: 'a1',
        unitId: 'u1',
        purpose: QuestionPurpose.ACTIVITY,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: [],
      }),
      update: async () => ({}),
    },
    attemptAnswer: { create: async () => ({}), update: async () => ({}) },
  };

  const prisma = {
    forSchool: async <T>(_school: string, work: (t: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PrismaService;

  return new LearningService(prisma, settingsWith(overrides), new QuestionEngineService());
}

describe('LearningService vocabulary completion (SRS 22, amended)', () => {
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

    const progress = await service.markVocabulary(student, 'w1', 'audio', AudioSource.BROWSER_TTS);

    expect((progress as { learnedAt: Date | null }).learnedAt).toBeNull();
  });

  /**
   * The rule the client raised on 2026-08-30. Seeing and hearing a word can
   * both be done by tapping through the cards, so neither, nor both together,
   * finishes it any more — the check does.
   */
  it('does not count it as learned from seeing AND hearing alone', async () => {
    const service = serviceOver({ vocabularyItem: item });

    await service.markVocabulary(student, 'w1', 'seen');
    const progress = await service.markVocabulary(student, 'w1', 'audio', AudioSource.BROWSER_TTS);

    expect((progress as { learnedAt: Date | null }).learnedAt).toBeNull();
  });

  it('still records both steps, whichever order she does them in', async () => {
    const service = serviceOver({ vocabularyItem: item });

    await service.markVocabulary(student, 'w1', 'audio', AudioSource.BROWSER_TTS);
    const progress = await service.markVocabulary(student, 'w1', 'seen') as {
      seenAt: Date | null;
      audioPlayedAt: Date | null;
    };

    expect(progress.seenAt).not.toBeNull();
    expect(progress.audioPlayedAt).not.toBeNull();
  });

  /** The older rule is still honoured where a school has it configured. */
  it('completes on seeing and hearing when that is the configured rule', async () => {
    const service = serviceOver(
      { vocabularyItem: item },
      { [SETTING_KEYS.VOCABULARY_COMPLETION_RULE]: 'seen_and_audio_played' },
    );

    await service.markVocabulary(student, 'w1', 'seen');
    const progress = await service.markVocabulary(student, 'w1', 'audio', AudioSource.BROWSER_TTS);

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
  it('falls back to the strictest reading when the rule is unrecognised', async () => {
    const service = serviceOver(
      { vocabularyItem: item },
      { [SETTING_KEYS.VOCABULARY_COMPLETION_RULE]: 'something_new' },
    );

    await service.markVocabulary(student, 'w1', 'seen');
    const progress = await service.markVocabulary(student, 'w1', 'audio', AudioSource.BROWSER_TTS);

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

    expect(progress.vocabulary).toEqual({ total: 2, done: 1, percent: 50, empty: false });
    expect(progress.grammar).toEqual({ total: 1, done: 1, percent: 100, empty: false });
    expect(progress.activity.percent).toBe(100);
    // This unit has no assessment yet, so that quarter is not earned.
    expect(progress.assessment).toEqual({ total: 0, done: 0, percent: 0, empty: true });
    expect(progress.missingContent).toEqual(['assessment']);
    // (50 + 100 + 100 + 0) / 4 components of equal weight
    expect(progress.overallPercent).toBe(63);
  });

  /**
   * All four components are built now, so nothing should be named here. The
   * mechanism stays: a weight the settings carry for something this platform
   * does not produce is reported rather than counted as zero, which would make
   * a finished unit look unfinished, or as done, which would be untrue.
   */
  it('names a weighted part it cannot measure rather than guessing at it', async () => {
    const service = serviceOver(
      { questions: 1 },
      {
        [SETTING_KEYS.PROGRESS_WEIGHTS]: {
          vocabulary: 20,
          grammar: 20,
          activity: 20,
          assessment: 20,
          speaking: 20,
        },
      },
    );

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.notCounted).toEqual(['speaking']);
  });

  it('counts nothing as not counted when every weighted part is built', async () => {
    const service = serviceOver({ questions: 1 });

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.notCounted).toEqual([]);
  });

  /**
   * The assessment is a quarter of the unit, and it is earned by passing.
   * Sitting it and failing uses a try; it does not move her on.
   */
  it('counts the assessment only once it has been passed', async () => {
    const failed = serviceOver({
      assessmentQuestions: 4,
      assessmentAttempts: [{ scorePercent: 50, passed: false }],
    });

    expect((await failed.unitProgress(student, 'u1')).assessment.percent).toBe(0);

    const passed = serviceOver({
      assessmentQuestions: 4,
      assessmentAttempts: [
        { scorePercent: 50, passed: false },
        { scorePercent: 90, passed: true },
      ],
    });

    expect((await passed.unitProgress(student, 'u1')).assessment.percent).toBe(100);
  });

  /**
   * Whether the pass mark was reached is read from what was recorded on the
   * day, never re-tested against today's setting. Lowering the mark next term
   * must not turn a fail already recorded into a pass.
   */
  it('does not re-mark an old attempt against a changed pass mark', async () => {
    const service = serviceOver(
      {
        assessmentQuestions: 4,
        // 60% recorded as a fail, when the mark was 80.
        assessmentAttempts: [{ scorePercent: 60, passed: false }],
      },
      // The mark has since been lowered to 50.
      { [SETTING_KEYS.ASSESSMENT_PASSING_SCORE]: 50 },
    );

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.assessmentState.passed).toBe(false);
    expect(progress.assessment.percent).toBe(0);
  });

  /**
   * Welcome and Grammar Review are preliminary and revision material (client,
   * 2026-08-31). Her progress through them is still worked out and shown; it
   * simply does not count towards the course.
   */
  it('reports whether a unit counts towards the course', async () => {
    const core = serviceOver({});
    expect((await core.unitProgress(student, 'u1')).countsTowardCompletion).toBe(true);

    const welcome = serviceOver({ countsTowardCompletion: false });
    expect((await welcome.unitProgress(student, 'u1')).countsTowardCompletion).toBe(false);
  });

  /** How many tries are left, and why she may not start another. */
  it('reports the assessment rules from the settings store', async () => {
    const service = serviceOver({
      assessmentQuestions: 4,
      assessmentAttempts: [
        { scorePercent: 40, passed: false },
        { scorePercent: 60, passed: false },
      ],
    });

    const { assessmentState } = await service.unitProgress(student, 'u1');

    expect(assessmentState.passMarkPercent).toBe(80);
    expect(assessmentState.maxAttempts).toBe(2);
    expect(assessmentState.attemptsUsed).toBe(2);
    expect(assessmentState.attemptsLeft).toBe(0);
    expect(assessmentState.bestScorePercent).toBe(60);
    expect(assessmentState.canStart).toBe(false);
    expect(assessmentState.blockedBecause).toBe('no_attempts_left');
  });

  it('will not let her sit an assessment she has already passed', async () => {
    const service = serviceOver({
      assessmentQuestions: 4,
      assessmentAttempts: [{ scorePercent: 90, passed: true }],
    });

    const { assessmentState } = await service.unitProgress(student, 'u1');

    expect(assessmentState.canStart).toBe(false);
    expect(assessmentState.blockedBecause).toBe('already_passed');
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

  /**
   * The defect this rule exists for.
   *
   * A part with nothing in it used to count as complete — "nothing left to
   * do" — which handed out a quarter of the unit for every part the teacher
   * had not prepared. A published unit with no words, no grammar, no activity
   * and no assessment reported 100% and marked itself complete for a student
   * who had never opened it.
   */
  it('gives nothing for a part the teacher has not filled in', async () => {
    const service = serviceOver({});

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.vocabulary).toEqual({ total: 0, done: 0, percent: 0, empty: true });
    expect(progress.grammar.percent).toBe(0);
    expect(progress.activity.percent).toBe(0);
    expect(progress.assessment.percent).toBe(0);
  });

  it('does not call an empty unit finished', async () => {
    const service = serviceOver({});

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.overallPercent).toBe(0);
    expect(progress.isComplete).toBe(false);
    expect(progress.missingContent).toEqual([
      'vocabulary',
      'grammar',
      'activity',
      'assessment',
    ]);
  });

  /** Each missing part costs exactly its own weight, and no more. */
  it('charges one quarter for each part that is missing', async () => {
    // Words done, grammar done, no activity, no assessment: half the unit
    // exists and she has finished all of it.
    const service = serviceOver({
      vocabularyItem: [{ id: 'w1', status: ContentStatus.PUBLISHED }],
      vocabularyProgress: [{ id: 'p1', itemId: 'w1', learnedAt: new Date() }],
      unitSection: [{ id: 's1', type: { progressComponent: 'grammar' } }],
      sectionProgress: [{ sectionId: 's1' }],
    });

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.overallPercent).toBe(50);
    expect(progress.missingContent).toEqual(['activity', 'assessment']);
    expect(progress.isComplete).toBe(false);
  });

  /**
   * The old reading is still reachable, because whether an unprepared part
   * counts is a decision the client may want to make differently.
   */
  it('can be told to treat an empty part as complete', async () => {
    const service = serviceOver(
      {},
      { [SETTING_KEYS.PROGRESS_EMPTY_COUNTS_AS_COMPLETE]: true },
    );

    const progress = await service.unitProgress(student, 'u1');

    expect(progress.overallPercent).toBe(100);
    expect(progress.vocabulary.percent).toBe(100);
    // Still reported as empty, whatever it is worth.
    expect(progress.missingContent).toHaveLength(4);
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

  function serviceWithDivergentQuestion(
    purpose: QuestionPurpose = QuestionPurpose.ACTIVITY,
    overrides: Record<string, unknown> = {},
  ) {
    const updates: Record<string, unknown>[] = [];
    const attempt = {
      id: 'att1',
      unitId: 'u1',
      studentId: STUDENT_ID,
      purpose,
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
      service: new LearningService(
        prisma,
        settingsWith(overrides),
        new QuestionEngineService(),
      ),
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

  /**
   * The pass mark is frozen with the score for the same reason the questions
   * are frozen with the paper: what she had to reach is part of the result.
   */
  it('writes the pass mark into an assessment result', async () => {
    const { service, updates } = serviceWithDivergentQuestion(QuestionPurpose.ASSESSMENT);

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'a' } });

    const attemptUpdate = updates.find((u) => 'scorePercent' in u);
    expect(attemptUpdate?.passMarkPercent).toBe(80);
    expect(attemptUpdate?.passed).toBe(true);
  });

  it('records a fail when the score is under the mark', async () => {
    const { service, updates } = serviceWithDivergentQuestion(QuestionPurpose.ASSESSMENT);

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'b' } });

    const attemptUpdate = updates.find((u) => 'scorePercent' in u);
    expect(attemptUpdate?.scorePercent).toBe(0);
    expect(attemptUpdate?.passed).toBe(false);
  });

  /** Practice has a score and no line to be the wrong side of. */
  it('gives a practice activity no pass mark at all', async () => {
    const { service, updates } = serviceWithDivergentQuestion(QuestionPurpose.ACTIVITY);

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'a' } });

    const attemptUpdate = updates.find((u) => 'scorePercent' in u);
    expect(attemptUpdate?.passMarkPercent).toBeNull();
    expect(attemptUpdate?.passed).toBeNull();
  });

  /** The mark is a setting, so a school that moves it moves it for real. */
  it('uses the pass mark the settings hold, not a number in this file', async () => {
    const { service, updates } = serviceWithDivergentQuestion(QuestionPurpose.ASSESSMENT, {
      [SETTING_KEYS.ASSESSMENT_PASSING_SCORE]: 100,
    });

    await service.submitActivity(student, 'att1', { ans1: { optionId: 'a' } });

    const attemptUpdate = updates.find((u) => 'scorePercent' in u);
    expect(attemptUpdate?.passMarkPercent).toBe(100);
  });
});

/**
 * A student may not claim to have heard a word (client, 2026-08-31).
 *
 * The screen calls this only when playback has finished, and says what played
 * it. The server cannot watch a browser speak, but it can refuse the claim it
 * is able to check — a teacher's recording that does not exist — and it can
 * refuse a request that names nothing at all, which is what a button reading
 * "I heard it" would send.
 */
describe('LearningService will not take her word for having heard a word', () => {
  const word = [{ id: 'w1', status: ContentStatus.PUBLISHED }];

  it('refuses a claim that names no source', async () => {
    const service = serviceOver({ vocabularyItem: word });

    await expect(service.markVocabulary(student, 'w1', 'audio')).rejects.toThrow(
      /play the word/i,
    );
  });

  it("refuses a teacher recording for a word that has none", async () => {
    const service = serviceOver({ vocabularyItem: word });

    await expect(
      service.markVocabulary(student, 'w1', 'audio', AudioSource.TEACHER_AUDIO),
    ).rejects.toThrow(/no recording/i);
  });

  it('accepts a teacher recording for a word that has one', async () => {
    const service = serviceOver({
      vocabularyItem: [
        {
          id: 'w1',
          status: ContentStatus.PUBLISHED,
          media: [{ url: '/api/v1/content/media/m1', mimeType: 'audio/mpeg' }],
        },
      ],
    });

    const progress = await service.markVocabulary(
      student,
      'w1',
      'audio',
      AudioSource.TEACHER_AUDIO,
    );

    expect((progress as { audioPlayedAt: Date | null }).audioPlayedAt).not.toBeNull();
  });

  /** A picture is not a recording. */
  it('does not mistake a picture on a word for a recording', async () => {
    const service = serviceOver({
      vocabularyItem: [
        {
          id: 'w1',
          status: ContentStatus.PUBLISHED,
          media: [{ url: '/api/v1/content/media/m1', mimeType: 'image/png' }],
        },
      ],
    });

    await expect(
      service.markVocabulary(student, 'w1', 'audio', AudioSource.TEACHER_AUDIO),
    ).rejects.toThrow(/no recording/i);
  });
});

/**
 * Her flow is Words, Grammar, Activity — nothing else (client, 2026-08-30).
 *
 * Writing, Handwriting, Reading and the rest are excluded in the query, so
 * they are absent from what she is sent rather than hidden by the screen. The
 * test below asserts on the filter the service builds, because that is where
 * the exclusion has to live to be real.
 */
describe('LearningService serves only the grammar step', () => {
  function serviceCapturingSectionFilter(captured: { where?: Record<string, unknown> }) {
    const tx = {
      unit: { findFirst: async () => ({ id: 'u1', title: 'Unit', description: null }) },
      unitSection: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          captured.where = args.where;
          return [];
        },
        findFirst: async (args: { where: Record<string, unknown> }) => {
          captured.where = args.where;
          return null;
        },
      },
      vocabularyItem: { findMany: async () => [] },
      question: { count: async () => 0 },
      vocabularyProgress: { findMany: async () => [] },
      sectionProgress: { findMany: async () => [] },
      // getUnit also reports how the unit's assessment stands for her.
      activityAttempt: { findMany: async () => [] },
    };

    const prisma = {
      forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
    } as unknown as PrismaService;

    return new LearningService(prisma, settingsWith(), new QuestionEngineService());
  }

  it('asks only for sections that belong to the grammar step', async () => {
    const captured: { where?: Record<string, unknown> } = {};
    const service = serviceCapturingSectionFilter(captured);

    await service.getUnit(student, 'u1');

    expect(captured.where?.type).toEqual({ progressComponent: 'grammar' });
  });

  it('refuses to record a read against a section outside that step', async () => {
    const captured: { where?: Record<string, unknown> } = {};
    const service = serviceCapturingSectionFilter(captured);

    await expect(service.markSectionViewed(student, 's1')).rejects.toThrow(/not found/i);
    expect(captured.where?.type).toEqual({ progressComponent: 'grammar' });
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
