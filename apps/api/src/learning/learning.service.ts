import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  ContentStatus,
  QuestionPurpose,
  SettingScope,
  UserRole,
} from '@prisma/client';
import { PrismaService, TenantClient } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SETTING_KEYS } from '../settings/settings.types';
import { QuestionEngineService, StoredQuestion } from '../questions/question-engine.service';
import { CurrentUser } from '../auth/auth.types';
import {
  AssessmentState,
  ComponentProgress,
  QuestionSnapshot,
  UnitProgress,
} from './learning.types';
import { AudioSource } from './dto/learning.dto';
import {
  buildCheck,
  CheckableWord,
  explainRefusal,
  isCorrectAnswer,
} from './vocabulary-check';

/** What the settings store holds under `progress.weights`. */
type ProgressWeights = Record<string, number>;

/**
 * The one kind of teaching section a student is given.
 *
 * Her flow is Words, Grammar, Activity — nothing else (client, 2026-08-30).
 * This is matched against `section_types.progress_component` rather than
 * against a section key, so a school that later decides another kind of
 * section belongs in the grammar step changes that column instead of this
 * file. The rule stays: what she is shown and what counts towards her grammar
 * progress are the same set, never two lists that can drift apart.
 */
const STUDENT_SECTION_COMPONENT = 'grammar';

/** A file the teacher attached to a word. */
interface WordMedia {
  url: string;
  mimeType: string;
}

/**
 * The teacher's own recording of a word, if she made one.
 *
 * This is the fallback for a browser with no working voice. It never lets a
 * student say she has heard a word without playing it (client, 2026-08-31).
 */
function teacherRecording(media: WordMedia[]): string | null {
  return media.find((m) => m.mimeType.startsWith('audio/'))?.url ?? null;
}

/** A picture illustrating a word, if the teacher attached one. */
function wordPicture(media: WordMedia[]): string | null {
  return media.find((m) => m.mimeType.startsWith('image/'))?.url ?? null;
}

/** The examples a teacher entered on a section, if any. */
function readExamples(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const examples = (config as { examples?: unknown }).examples;
  if (!Array.isArray(examples)) return [];
  return examples.filter((e): e is string => typeof e === 'string');
}

/**
 * The student's own journey through a unit.
 *
 * Two rules run through everything here:
 *
 *   Nothing unapproved reaches a student. Every read filters on PUBLISHED, so
 *   material a teacher is still correcting simply is not there — not hidden by
 *   the interface, absent from the answer.
 *
 *   Nothing is decided in code that the client may want to change. How many
 *   retries, what makes a word learned, how the parts of a unit are weighted
 *   and which result counts all come from the settings store (SRS 9, 19, 21,
 *   22).
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: QuestionEngineService,
  ) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /**
   * These screens are the student's.
   *
   * A teacher previewing them would get her own progress recorded against the
   * curriculum, which is not what a preview means. She has the preview route
   * on the questions API for that.
   */
  private assertStudent(actor: CurrentUser): void {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('These pages are for students.');
    }
  }

  private scopes(unitId?: string) {
    return unitId ? [{ scope: SettingScope.UNIT, scopeId: unitId }] : [];
  }

  // --- Navigation ----------------------------------------------------------

  /** The units she can work on, each with how far she has got. */
  async listUnits(actor: CurrentUser) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    const units = await this.prisma.forSchool(schoolId, (tx) =>
      tx.unit.findMany({
        where: { status: ContentStatus.PUBLISHED },
        orderBy: { orderIndex: 'asc' },
      }),
    );

    const progress = await Promise.all(
      units.map((unit) => this.unitProgress(actor, unit.id)),
    );

    return units.map((unit, i) => ({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      orderIndex: unit.orderIndex,
      progress: progress[i],
    }));
  }

  /**
   * One unit, as a student sees it.
   *
   * Everything is filtered to PUBLISHED, so an unapproved word, section or
   * question is not merely hidden — it never leaves the database.
   */
  async getUnit(actor: CurrentUser, unitId: string) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: ContentStatus.PUBLISHED },
      });

      if (!unit) throw new NotFoundException('Unit not found.');

      const [sections, vocabulary, questionCount] = await Promise.all([
        tx.unitSection.findMany({
          where: {
            unitId,
            status: ContentStatus.PUBLISHED,
            // Writing, Handwriting, Reading and the rest are not part of her
            // flow. They are excluded here rather than hidden by the screen,
            // so they are absent from the answer, not merely unrendered.
            type: { progressComponent: STUDENT_SECTION_COMPONENT },
          },
          orderBy: { orderIndex: 'asc' },
          include: { type: true, media: true },
        }),
        tx.vocabularyItem.findMany({
          where: { unitId, status: ContentStatus.PUBLISHED },
          orderBy: { orderIndex: 'asc' },
          include: { media: { orderBy: { orderIndex: 'asc' } } },
        }),
        tx.question.count({
          where: {
            unitId,
            status: ContentStatus.PUBLISHED,
            purpose: QuestionPurpose.ACTIVITY,
          },
        }),
      ]);

      const [vocabProgress, sectionProgress] = await Promise.all([
        tx.vocabularyProgress.findMany({ where: { studentId: actor.userId } }),
        tx.sectionProgress.findMany({ where: { studentId: actor.userId } }),
      ]);

      const seenSections = new Set(sectionProgress.map((p) => p.sectionId));
      const byItem = new Map(vocabProgress.map((p) => [p.itemId, p]));

      return {
        id: unit.id,
        title: unit.title,
        description: unit.description,
        sections: sections.map((section) => ({
          id: section.id,
          typeKey: section.typeKey,
          title: section.title,
          body: section.body,
          // Worked examples, kept apart from the explanation because that is
          // how a grammar page reads.
          examples: readExamples(section.config),
          orderIndex: section.orderIndex,
          type: section.type,
          media: section.media.map((m) => ({ id: m.id, url: m.url, altText: m.altText })),
          viewed: seenSections.has(section.id),
        })),
        vocabulary: vocabulary.map((item) => {
          const p = byItem.get(item.id);
          return {
            id: item.id,
            wordEn: item.wordEn,
            meaningAr: item.meaningAr,
            partOfSpeech: item.partOfSpeech,
            exampleSentence: item.exampleSentence,
            orderIndex: item.orderIndex,
            // A recording the teacher made, for a browser whose own voice does
            // not work. Null when there is none, which the screen reports
            // honestly rather than pretending the word can be heard.
            teacherAudioUrl: teacherRecording(item.media),
            pictureUrl: wordPicture(item.media),
            seen: Boolean(p?.seenAt),
            audioPlayed: Boolean(p?.audioPlayedAt),
            checked: Boolean(p?.verifiedAt),
            learned: Boolean(p?.learnedAt),
            // The check only opens once she has read and heard the word.
            checkReady: Boolean(p?.seenAt && p?.audioPlayedAt && !p?.verifiedAt),
            checkAttempts: p?.checkAttempts ?? 0,
          };
        }),
        activity: { questionCount },
        assessment: await this.assessmentState(tx, actor.userId, unitId),
      };
    });
  }

  /**
   * The unit's assessment, as it stands for one student.
   *
   * Every rule here is a setting: the mark to reach, how many tries, and which
   * try counts (SRS 17, 18, 19). Nothing is decided in this file.
   */
  private async assessmentState(
    tx: Pick<PrismaService, 'question' | 'activityAttempt'>,
    studentId: string,
    unitId: string,
  ): Promise<AssessmentState> {
    const [passMark, maxAttempts, resultPolicy] = await Promise.all([
      this.settings.resolve<number>(SETTING_KEYS.ASSESSMENT_PASSING_SCORE, this.scopes(unitId)),
      this.settings.resolve<number | null>(
        SETTING_KEYS.ASSESSMENT_MAX_ATTEMPTS,
        this.scopes(unitId),
      ),
      this.settings.resolve<string>(SETTING_KEYS.ASSESSMENT_RESULT_POLICY, this.scopes(unitId)),
    ]);

    const passMarkPercent = passMark ?? 100;

    const [questionCount, attempts] = await Promise.all([
      tx.question.count({
        where: { unitId, status: ContentStatus.PUBLISHED, purpose: QuestionPurpose.ASSESSMENT },
      }),
      tx.activityAttempt.findMany({
        where: {
          studentId,
          unitId,
          purpose: QuestionPurpose.ASSESSMENT,
          status: AttemptStatus.SUBMITTED,
        },
        orderBy: { submittedAt: 'asc' },
        select: { scorePercent: true, passed: true },
      }),
    ]);

    const scores = attempts
      .map((a) => a.scorePercent)
      .filter((score): score is number => typeof score === 'number');

    const bestScorePercent = scores.length
      ? resultPolicy === 'latest'
        ? scores[scores.length - 1]
        : Math.max(...scores)
      : null;

    // Read from what was recorded at the time, not by re-testing today's mark
    // against an old score: the mark she had to reach was frozen with it.
    const passed = attempts.some((a) => a.passed === true);

    const attemptsUsed = attempts.length;
    const attemptsLeft =
      typeof maxAttempts === 'number' ? Math.max(0, maxAttempts - attemptsUsed) : null;

    const blockedBecause: AssessmentState['blockedBecause'] =
      questionCount === 0
        ? 'no_questions'
        : passed
          ? 'already_passed'
          : attemptsLeft === 0
            ? 'no_attempts_left'
            : null;

    return {
      questionCount,
      passMarkPercent,
      maxAttempts: typeof maxAttempts === 'number' ? maxAttempts : null,
      attemptsUsed,
      attemptsLeft,
      bestScorePercent,
      passed,
      canStart: blockedBecause === null,
      blockedBecause,
    };
  }

  // --- Vocabulary ----------------------------------------------------------

  /**
   * Records that a word was shown, or that its pronunciation was played.
   *
   * A word is learned only when the configured rule is satisfied. The default
   * confirmed for this client is that she must both see it and hear it
   * (SRS 22), which is why the two are recorded separately.
   */
  async markVocabulary(
    actor: CurrentUser,
    itemId: string,
    event: 'seen' | 'audio',
    audioSource?: AudioSource,
  ) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    const rule = await this.settings.resolve<string>(
      SETTING_KEYS.VOCABULARY_COMPLETION_RULE,
    );

    return this.prisma.forSchool(schoolId, async (tx) => {
      // Published only: progress cannot be recorded against a draft word.
      const item = await tx.vocabularyItem.findFirst({
        where: { id: itemId, status: ContentStatus.PUBLISHED },
        include: { media: true },
      });

      if (!item) throw new NotFoundException('Word not found.');

      if (event === 'audio') {
        // She may not claim to have heard a word; the screen reports what it
        // played, after it finished playing (client, 2026-08-31). The server
        // can check one of the two claims outright — a teacher's recording
        // that does not exist cannot have been played — and refuses the
        // request outright when neither way of hearing the word is available.
        const recording = teacherRecording(item.media);

        if (audioSource === AudioSource.TEACHER_AUDIO && !recording) {
          throw new BadRequestException('There is no recording of this word to play.');
        }

        if (!audioSource) {
          throw new BadRequestException('Play the word before marking it heard.');
        }
      }

      const now = new Date();
      const existing = await tx.vocabularyProgress.findFirst({
        where: { studentId: actor.userId, itemId },
      });

      const seenAt = event === 'seen' ? (existing?.seenAt ?? now) : (existing?.seenAt ?? null);
      const audioPlayedAt =
        event === 'audio' ? (existing?.audioPlayedAt ?? now) : (existing?.audioPlayedAt ?? null);

      const satisfied = this.isLearned(rule, seenAt, audioPlayedAt, existing?.verifiedAt ?? null);
      // Never re-dated: the first time she finished it is when she finished it.
      const learnedAt = existing?.learnedAt ?? (satisfied ? now : null);

      if (existing) {
        return tx.vocabularyProgress.update({
          where: { id: existing.id },
          data: { seenAt, audioPlayedAt, learnedAt },
        });
      }

      return tx.vocabularyProgress.create({
        data: { studentId: actor.userId, itemId, seenAt, audioPlayedAt, learnedAt },
      });
    });
  }

  /**
   * Applies the configured completion rule.
   *
   * The rule confirmed for this client is `seen_and_audio_played`. It is read
   * from the settings store rather than assumed, and an unrecognised value is
   * treated as the strictest reading rather than silently letting a word count
   * as learned.
   */
  private isLearned(
    rule: string | undefined,
    seenAt: Date | null,
    audioPlayedAt: Date | null,
    verifiedAt: Date | null,
  ): boolean {
    if (rule === 'seen_only') return Boolean(seenAt);
    if (rule === 'seen_and_audio_played') return Boolean(seenAt && audioPlayedAt);
    // The confirmed rule, and the strictest reading of anything unrecognised:
    // she has seen it, heard it, and answered a check on it.
    return Boolean(seenAt && audioPlayedAt && verifiedAt);
  }

  /**
   * The check for one word.
   *
   * Built from what the teacher entered and nothing else: the word, her Arabic
   * meaning for it, and other words' meanings from the same unit as the wrong
   * choices. Where a unit does not hold enough real material to ask fairly,
   * this says so instead of inventing a question (client, 2026-08-30).
   */
  async getVocabularyCheck(actor: CurrentUser, itemId: string) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const item = await tx.vocabularyItem.findFirst({
        where: { id: itemId, status: ContentStatus.PUBLISHED },
      });
      if (!item) throw new NotFoundException('Word not found.');

      const progress = await tx.vocabularyProgress.findFirst({
        where: { studentId: actor.userId, itemId },
      });

      // The check is the last step, not the first: it is asked once she has
      // actually read and heard the word.
      if (!progress?.seenAt || !progress?.audioPlayedAt) {
        throw new BadRequestException('Read and listen to the word first.');
      }

      const others = await tx.vocabularyItem.findMany({
        where: {
          unitId: item.unitId,
          status: ContentStatus.PUBLISHED,
          id: { not: itemId },
        },
      });

      const { check, refusedBecause } = buildCheck(
        item as CheckableWord,
        others as CheckableWord[],
        `${actor.userId}:${itemId}:${progress.checkAttempts}`,
      );

      if (!check) {
        return {
          available: false as const,
          reason: explainRefusal(refusedBecause!),
          itemId,
          wordEn: item.wordEn,
        };
      }

      return { available: true as const, ...check };
    });
  }

  /**
   * Marks her answer to the check.
   *
   * A wrong answer costs nothing but the attempt: she can look at the word
   * again and try once more. Only a right one completes the word.
   */
  async answerVocabularyCheck(actor: CurrentUser, itemId: string, answer: string) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    const rule = await this.settings.resolve<string>(
      SETTING_KEYS.VOCABULARY_COMPLETION_RULE,
    );

    return this.prisma.forSchool(schoolId, async (tx) => {
      const item = await tx.vocabularyItem.findFirst({
        where: { id: itemId, status: ContentStatus.PUBLISHED },
      });
      if (!item) throw new NotFoundException('Word not found.');

      const existing = await tx.vocabularyProgress.findFirst({
        where: { studentId: actor.userId, itemId },
      });

      if (!existing?.seenAt || !existing?.audioPlayedAt) {
        throw new BadRequestException('Read and listen to the word first.');
      }

      const correct = isCorrectAnswer(item as CheckableWord, answer);
      const now = new Date();
      // Never re-dated: the first time she got it right is when she got it right.
      const verifiedAt = existing.verifiedAt ?? (correct ? now : null);

      const satisfied = this.isLearned(rule, existing.seenAt, existing.audioPlayedAt, verifiedAt);
      const learnedAt = existing.learnedAt ?? (satisfied ? now : null);

      const updated = await tx.vocabularyProgress.update({
        where: { id: existing.id },
        data: {
          verifiedAt,
          learnedAt,
          checkAttempts: { increment: 1 },
        },
      });

      return {
        correct,
        learned: Boolean(updated.learnedAt),
        attempts: updated.checkAttempts,
      };
    });
  }

  // --- Teaching sections ---------------------------------------------------

  /** Records that she has read a grammar, reading or writing section. */
  async markSectionViewed(actor: CurrentUser, sectionId: string) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const section = await tx.unitSection.findFirst({
        where: {
          id: sectionId,
          status: ContentStatus.PUBLISHED,
          type: { progressComponent: STUDENT_SECTION_COMPONENT },
        },
      });

      if (!section) throw new NotFoundException('Section not found.');

      const existing = await tx.sectionProgress.findFirst({
        where: { studentId: actor.userId, sectionId },
      });

      if (existing) return existing;

      return tx.sectionProgress.create({
        data: { studentId: actor.userId, sectionId },
      });
    });
  }

  // --- Activity ------------------------------------------------------------

  /**
   * Starts an activity or an assessment, or hands back the one already open.
   *
   * One method for both. They draw from different pools of questions and obey
   * different rules about retries, and everything else — the shuffle, the
   * freezing, the marking, the review afterwards — is the same, so writing a
   * second copy would only give the two a way to drift apart.
   *
   * The questions are frozen into the attempt as they stand right now. That is
   * the whole point: from here on she is answering the questions she was
   * given, and a teacher correcting one afterwards does not change the paper
   * in front of her, nor any result already recorded.
   */
  async startActivity(
    actor: CurrentUser,
    unitId: string,
    purpose: QuestionPurpose = QuestionPurpose.ACTIVITY,
  ) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);
    const isAssessment = purpose === QuestionPurpose.ASSESSMENT;

    const [shuffleQuestions, shuffleOptions, maxAttempts] = await Promise.all([
      this.settings.resolve<boolean>(
        SETTING_KEYS.RANDOMIZATION_SHUFFLE_QUESTIONS,
        this.scopes(unitId),
      ),
      this.settings.resolve<boolean>(
        SETTING_KEYS.RANDOMIZATION_SHUFFLE_OPTIONS,
        this.scopes(unitId),
      ),
      this.settings.resolve<number | null>(
        isAssessment ? SETTING_KEYS.ASSESSMENT_MAX_ATTEMPTS : SETTING_KEYS.ACTIVITY_MAX_ATTEMPTS,
        this.scopes(unitId),
      ),
    ]);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: ContentStatus.PUBLISHED },
      });
      if (!unit) throw new NotFoundException('Unit not found.');

      // An attempt she has not finished is resumed, not replaced, so closing
      // the page does not lose her work or reshuffle the questions.
      const open = await tx.activityAttempt.findFirst({
        where: { studentId: actor.userId, unitId, purpose, status: AttemptStatus.IN_PROGRESS },
        include: { answers: { orderBy: { orderIndex: 'asc' } } },
      });

      if (open) return this.asStudentAttempt(open);

      if (isAssessment) {
        // A pass is the end of it. Letting her sit it again could only lower a
        // result she has already earned, or waste a try she does not need.
        const state = await this.assessmentState(tx, actor.userId, unitId);

        if (state.blockedBecause === 'already_passed') {
          throw new BadRequestException('You have already passed this assessment.');
        }
        if (state.blockedBecause === 'no_attempts_left') {
          throw new BadRequestException('You have used all your tries for this assessment.');
        }
      } else if (typeof maxAttempts === 'number') {
        // Activities are unlimited for this client (SRS 9), which the settings
        // store expresses as null. A number is honoured if one is ever set.
        const taken = await tx.activityAttempt.count({
          where: { studentId: actor.userId, unitId, purpose, status: AttemptStatus.SUBMITTED },
        });

        if (taken >= maxAttempts) {
          throw new BadRequestException('You have used all your tries for this activity.');
        }
      }

      const questions = await tx.question.findMany({
        where: { unitId, purpose, status: ContentStatus.PUBLISHED },
        orderBy: { orderIndex: 'asc' },
        include: {
          media: {
            orderBy: { orderIndex: 'asc' },
            select: { id: true, url: true, altText: true },
          },
        },
      });

      if (questions.length === 0) {
        throw new BadRequestException(
          isAssessment ? 'This unit has no assessment yet.' : 'This unit has no activity yet.',
        );
      }

      const seed = `${actor.userId}:${unitId}:${Date.now()}`;

      const stored: StoredQuestion[] = questions.map((q) => ({
        id: q.id,
        typeKey: q.typeKey,
        prompt: q.prompt,
        payload: q.payload,
        answerKey: q.answerKey,
        points: q.points,
      }));

      // The engine decides the order and what the student may see. Presenting
      // first and snapshotting from that keeps the frozen copy and the shown
      // copy in step.
      const presented = this.engine.present(stored, {
        seed,
        shuffleQuestions: shuffleQuestions ?? true,
        shuffleOptions: shuffleOptions ?? true,
      });

      const byId = new Map(stored.map((q) => [q.id, q]));
      const mediaById = new Map(questions.map((q) => [q.id, q.media]));
      const capturedAt = new Date().toISOString();

      const attempt = await tx.activityAttempt.create({
        data: {
          studentId: actor.userId,
          unitId,
          purpose,
          seed,
          status: AttemptStatus.IN_PROGRESS,
        },
      });

      for (const [index, shown] of presented.entries()) {
        const source = byId.get(shown.id);
        if (!source) continue;

        const snapshot: QuestionSnapshot = {
          questionId: source.id,
          typeKey: source.typeKey,
          prompt: shown.prompt,
          // The payload as SHOWN, options in the order she saw them, so a
          // review of the attempt later reproduces her screen exactly.
          payload: shown.payload,
          answerKey: source.answerKey as Record<string, unknown>,
          points: source.points,
          media: mediaById.get(source.id) ?? [],
          capturedAt,
        };

        await tx.attemptAnswer.create({
          data: {
            attemptId: attempt.id,
            questionId: source.id,
            orderIndex: index,
            snapshot: snapshot as never,
          },
        });
      }

      const full = await tx.activityAttempt.findUnique({
        where: { id: attempt.id },
        include: { answers: { orderBy: { orderIndex: 'asc' } } },
      });

      return this.asStudentAttempt(full!);
    });
  }

  /**
   * Marks an attempt from its own frozen questions.
   *
   * Nothing here reads the live question table. That is what makes an old
   * result stable while the curriculum behind it is being corrected.
   *
   * For an assessment the pass mark is written into the attempt beside the
   * score, for the same reason: lowering the mark next term must not turn a
   * fail already recorded into a pass.
   */
  async submitActivity(
    actor: CurrentUser,
    attemptId: string,
    responses: Record<string, unknown>,
  ) {
    this.assertStudent(actor);
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const attempt = await tx.activityAttempt.findFirst({
        where: { id: attemptId, studentId: actor.userId },
        include: { answers: { orderBy: { orderIndex: 'asc' } } },
      });

      if (!attempt) throw new NotFoundException('Attempt not found.');

      if (attempt.status === AttemptStatus.SUBMITTED) {
        throw new BadRequestException('You have already finished this activity.');
      }

      let correctCount = 0;
      let pointsAwarded = 0;
      let pointsAvailable = 0;

      for (const answer of attempt.answers) {
        const snapshot = answer.snapshot as unknown as QuestionSnapshot;
        const response = responses[answer.id];

        const graded = this.engine.grade(
          {
            id: snapshot.questionId,
            typeKey: snapshot.typeKey,
            prompt: snapshot.prompt,
            payload: snapshot.payload,
            answerKey: snapshot.answerKey,
            points: snapshot.points,
          },
          response,
        );

        pointsAvailable += snapshot.points;
        pointsAwarded += graded.pointsAwarded;
        if (graded.isCorrect) correctCount += 1;

        await tx.attemptAnswer.update({
          where: { id: answer.id },
          data: {
            response: (response ?? null) as never,
            isCorrect: graded.isCorrect,
            pointsAwarded: graded.pointsAwarded,
          },
        });
      }

      const incorrectCount = attempt.answers.length - correctCount;
      const scorePercent =
        pointsAvailable === 0 ? 0 : Math.round((pointsAwarded / pointsAvailable) * 100);

      // Only an assessment has a pass mark. An activity is practice: it has a
      // score, and no line to be the wrong side of.
      const passMarkPercent =
        attempt.purpose === QuestionPurpose.ASSESSMENT
          ? ((await this.settings.resolve<number>(
              SETTING_KEYS.ASSESSMENT_PASSING_SCORE,
              this.scopes(attempt.unitId),
            )) ?? 100)
          : null;

      await tx.activityAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt: new Date(),
          correctCount,
          incorrectCount,
          pointsAwarded,
          pointsAvailable,
          scorePercent,
          passMarkPercent,
          passed: passMarkPercent === null ? null : scorePercent >= passMarkPercent,
        },
      });

      const finished = await tx.activityAttempt.findUnique({
        where: { id: attempt.id },
        include: { answers: { orderBy: { orderIndex: 'asc' } } },
      });

      return this.asReviewedAttempt(finished!);
    });
  }

  /**
   * Her past tries at one unit.
   *
   * Retries are unlimited, so this is a list rather than a single result. It
   * is also how she reaches a finished attempt again: the questions in it are
   * the ones she was given, not the ones the unit holds today.
   */
  async listAttempts(
    actor: CurrentUser,
    unitId: string,
    purpose: QuestionPurpose = QuestionPurpose.ACTIVITY,
  ) {
    this.assertStudent(actor);

    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const attempts = await tx.activityAttempt.findMany({
        where: { studentId: actor.userId, unitId, purpose, status: AttemptStatus.SUBMITTED },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          purpose: true,
          submittedAt: true,
          correctCount: true,
          incorrectCount: true,
          pointsAwarded: true,
          pointsAvailable: true,
          scorePercent: true,
          passMarkPercent: true,
          passed: true,
        },
      });

      return attempts;
    });
  }

  /** A finished attempt, with what was right and what the answer was. */
  async getAttempt(actor: CurrentUser, attemptId: string) {
    this.assertStudent(actor);

    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const attempt = await tx.activityAttempt.findFirst({
        where: { id: attemptId, studentId: actor.userId },
        include: { answers: { orderBy: { orderIndex: 'asc' } } },
      });

      if (!attempt) throw new NotFoundException('Attempt not found.');

      return attempt.status === AttemptStatus.SUBMITTED
        ? this.asReviewedAttempt(attempt)
        : this.asStudentAttempt(attempt);
    });
  }

  // --- Progress ------------------------------------------------------------

  /**
   * How far she has got with one unit.
   *
   * Weights come from `progress.weights`: an equal quarter each for words,
   * grammar, activities and the assessment (SRS 21). A component the settings
   * weight that this platform does not produce is named in `notCounted` and
   * left out of the total, rather than counted as zero — which would make a
   * finished unit look unfinished — or as complete, which would be a lie.
   *
   * Games are not part of this calculation at all. Nothing in this method
   * reads a game, which is the SRS 13.1 rule (`games.affects_progress` false)
   * expressed as an absence rather than a condition that could be flipped.
   */
  async unitProgress(actor: CurrentUser, unitId: string): Promise<UnitProgress> {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, (tx) => this.progressWithin(tx, actor, unitId));
  }

  /**
   * The same calculation, inside a transaction the caller already has open.
   *
   * The teacher's class view needs this for every student across every unit.
   * Opening a transaction per unit per student ran them all at once and
   * exhausted the connection pool — eighteen units was enough to turn her main
   * screen into a 500. One transaction per student is what she gets now.
   */
  async progressWithin(
    tx: TenantClient,
    actor: CurrentUser,
    unitId: string,
  ): Promise<UnitProgress> {
    const [weights, resultPolicy, emptyCountsAsComplete] = await Promise.all([
      this.settings.resolve<ProgressWeights>(SETTING_KEYS.PROGRESS_WEIGHTS, this.scopes(unitId)),
      this.settings.resolve<string>(SETTING_KEYS.ASSESSMENT_RESULT_POLICY, this.scopes(unitId)),
      this.settings.resolve<boolean>(
        SETTING_KEYS.PROGRESS_EMPTY_COUNTS_AS_COMPLETE,
        this.scopes(unitId),
      ),
    ]);

    {
      const [unit, vocabulary, sections, questionCount, attempts, assessment] =
        await Promise.all([
          tx.unit.findUnique({
            where: { id: unitId },
            select: { countsTowardCompletion: true },
          }),
          tx.vocabularyItem.findMany({
            where: { unitId, status: ContentStatus.PUBLISHED },
            select: { id: true },
          }),
          tx.unitSection.findMany({
            where: { unitId, status: ContentStatus.PUBLISHED },
            select: { id: true, type: { select: { progressComponent: true } } },
          }),
          tx.question.count({
            where: {
              unitId,
              status: ContentStatus.PUBLISHED,
              purpose: QuestionPurpose.ACTIVITY,
            },
          }),
          tx.activityAttempt.findMany({
            where: {
              studentId: actor.userId,
              unitId,
              purpose: QuestionPurpose.ACTIVITY,
              status: AttemptStatus.SUBMITTED,
            },
            select: { scorePercent: true },
          }),
          this.assessmentState(tx, actor.userId, unitId),
        ]);

      const vocabIds = vocabulary.map((v) => v.id);
      const learned = vocabIds.length
        ? await tx.vocabularyProgress.count({
            where: { studentId: actor.userId, itemId: { in: vocabIds }, learnedAt: { not: null } },
          })
        : 0;

      // Which sections count is a property of the section type, held as data.
      const grammarSections = sections.filter(
        (s) => s.type.progressComponent === STUDENT_SECTION_COMPONENT,
      );
      const grammarIds = grammarSections.map((s) => s.id);
      const grammarViewed = grammarIds.length
        ? await tx.sectionProgress.count({
            where: { studentId: actor.userId, sectionId: { in: grammarIds } },
          })
        : 0;

      const scores = attempts
        .map((a) => a.scorePercent)
        .filter((s): s is number => typeof s === 'number');

      // "highest" is what this client confirmed (SRS 19). The alternative the
      // SRS names is the latest attempt.
      const bestScorePercent = scores.length
        ? resultPolicy === 'latest'
          ? scores[scores.length - 1]
          : Math.max(...scores)
        : null;

      const emptyIsDone = emptyCountsAsComplete === true;

      const vocabProgress = this.component(vocabIds.length, learned, emptyIsDone);
      const grammarProgress = this.component(grammarIds.length, grammarViewed, emptyIsDone);
      // An activity counts as done once she has finished it at least once.
      // Retries are unlimited and improve the score, not the completion.
      const activityProgress = this.component(
        questionCount > 0 ? 1 : 0,
        bestScorePercent === null ? 0 : 1,
        emptyIsDone,
      );

      // The assessment is done when it has been passed, not when it has been
      // sat: a failed attempt is a try used, not a quarter of the unit earned.
      const assessmentProgress = this.component(
        assessment.questionCount > 0 ? 1 : 0,
        assessment.passed ? 1 : 0,
        emptyIsDone,
      );

      const parts: { key: string; progress: ComponentProgress }[] = [
        { key: 'vocabulary', progress: vocabProgress },
        { key: 'grammar', progress: grammarProgress },
        { key: 'activity', progress: activityProgress },
        { key: 'assessment', progress: assessmentProgress },
      ];

      const notCounted: string[] = [];
      // Parts the teacher has not filled in yet. They hold the unit below
      // 100%, so they are named rather than showing an unexplained zero.
      const missingContent = parts.filter((p) => p.progress.empty).map((p) => p.key);
      let weighted = 0;
      let totalWeight = 0;

      for (const { key, progress } of parts) {
        const weight = weights?.[key] ?? 0;
        totalWeight += weight;
        weighted += (progress.percent / 100) * weight;
      }

      // Anything the settings weight that this phase does not produce is
      // reported rather than guessed at.
      for (const key of Object.keys(weights ?? {})) {
        if (!parts.some((p) => p.key === key)) notCounted.push(key);
      }

      const overallPercent = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);

      return {
        unitId,
        vocabulary: vocabProgress,
        grammar: grammarProgress,
        activity: activityProgress,
        assessment: assessmentProgress,
        bestScorePercent,
        attemptsTaken: attempts.length,
        assessmentState: assessment,
        // Welcome and Grammar Review are preliminary and revision material
        // (client, 2026-08-31). Her progress through them is still worked out
        // and shown; it simply does not count towards the course.
        countsTowardCompletion: unit?.countsTowardCompletion ?? true,
        overallPercent,
        notCounted,
        missingContent,
        // Every part at 100%. With an empty part worth nothing, a unit whose
        // preparation is unfinished cannot be completed by a student — which
        // is the point: completion has to mean work she actually did.
        isComplete: parts.every((p) => p.progress.percent === 100),
      };
    }
  }

  /**
   * How far one part of a unit has got.
   *
   * A part with nothing in it is NOT finished. It used to count as complete —
   * "nothing left to do" — and that quietly handed out a quarter of the unit
   * for every part a teacher had not prepared yet: a published unit with no
   * words, no grammar, no activity and no assessment reported 100% and marked
   * itself complete for a student who had never opened it. Measured, not
   * argued: all sixteen combinations were read back from the API.
   *
   * `emptyIsDone` restores the old reading if a school ever wants it, through
   * `progress.empty_component_counts_as_complete` in the settings store.
   */
  private component(total: number, done: number, emptyIsDone = false): ComponentProgress {
    if (total === 0) {
      return { total: 0, done: 0, percent: emptyIsDone ? 100 : 0, empty: true };
    }
    return { total, done, percent: Math.round((done / total) * 100), empty: false };
  }

  // --- Shaping -------------------------------------------------------------

  /** An attempt in progress: the questions, with no answers in sight. */
  private asStudentAttempt(attempt: {
    id: string;
    unitId: string;
    purpose: QuestionPurpose;
    status: AttemptStatus;
    startedAt: Date;
    answers: { id: string; orderIndex: number; snapshot: unknown; response: unknown }[];
  }) {
    return {
      id: attempt.id,
      unitId: attempt.unitId,
      purpose: attempt.purpose,
      status: attempt.status,
      startedAt: attempt.startedAt,
      questions: attempt.answers.map((answer) => {
        const snapshot = answer.snapshot as QuestionSnapshot;
        return {
          answerId: answer.id,
          typeKey: snapshot.typeKey,
          prompt: snapshot.prompt,
          payload: snapshot.payload,
          points: snapshot.points,
          media: snapshot.media ?? [],
          response: answer.response ?? null,
        };
      }),
    };
  }

  /** A finished attempt: what she answered, what was right, and the score. */
  private asReviewedAttempt(attempt: {
    id: string;
    unitId: string;
    purpose: QuestionPurpose;
    status: AttemptStatus;
    startedAt: Date;
    submittedAt: Date | null;
    correctCount: number | null;
    incorrectCount: number | null;
    pointsAwarded: number | null;
    pointsAvailable: number | null;
    scorePercent: number | null;
    passMarkPercent: number | null;
    passed: boolean | null;
    answers: {
      id: string;
      orderIndex: number;
      snapshot: unknown;
      response: unknown;
      isCorrect: boolean | null;
      pointsAwarded: number | null;
    }[];
  }) {
    return {
      id: attempt.id,
      unitId: attempt.unitId,
      purpose: attempt.purpose,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      correctCount: attempt.correctCount,
      incorrectCount: attempt.incorrectCount,
      pointsAwarded: attempt.pointsAwarded,
      pointsAvailable: attempt.pointsAvailable,
      scorePercent: attempt.scorePercent,
      // The mark she had to reach, as it was on the day. Null for practice.
      passMarkPercent: attempt.passMarkPercent,
      passed: attempt.passed,
      questions: attempt.answers.map((answer) => {
        const snapshot = answer.snapshot as QuestionSnapshot;
        return {
          answerId: answer.id,
          typeKey: snapshot.typeKey,
          prompt: snapshot.prompt,
          payload: snapshot.payload,
          points: snapshot.points,
          media: snapshot.media ?? [],
          response: answer.response ?? null,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          // Only ever after submission, and only from the frozen copy.
          expected: snapshot.answerKey,
        };
      }),
    };
  }
}
