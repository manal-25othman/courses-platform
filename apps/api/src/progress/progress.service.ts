import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, ContentStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LearningService } from '../learning/learning.service';
import { CurrentUser } from '../auth/auth.types';
import { QuestionSnapshot } from '../learning/learning.types';

/**
 * What the teacher sees about how her class is getting on.
 *
 * Everything here is read from what students have actually recorded. There is
 * no field a student can set to say she has finished a unit, and nothing here
 * writes anything: it is a view over her work, not a second copy of it.
 *
 * Scoping is the same rule the roster already uses — a teacher sees her own
 * students, not the whole school (SRS 35) — on top of the school scoping the
 * database enforces underneath.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: LearningService,
  ) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /** Students this teacher is responsible for. Admins see the school's. */
  private scopeFor(actor: CurrentUser): Prisma.UserWhereInput {
    const scope: Prisma.UserWhereInput = {
      role: UserRole.STUDENT,
      schoolId: actor.schoolId,
      deletedAt: null,
    };

    if (actor.role === UserRole.TEACHER) {
      scope.studentProfile = { assignedTeacherId: actor.userId };
    }

    return scope;
  }

  /**
   * The class at a glance: one row per student, with how far she has got
   * across every published unit.
   */
  async classOverview(actor: CurrentUser) {
    const schoolId = this.schoolOf(actor);

    const { students, units } = await this.prisma.forSchool(schoolId, async (tx) => ({
      students: await tx.user.findMany({
        where: this.scopeFor(actor),
        include: { studentProfile: true },
        orderBy: { createdAt: 'asc' },
      }),
      units: await tx.unit.findMany({
        where: { status: ContentStatus.PUBLISHED },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, title: true },
      }),
    }));

    const rows = await Promise.all(
      students.map(async (student) => {
        const perUnit = await Promise.all(
          units.map(async (unit) => ({
            title: unit.title,
            ...(await this.learning.unitProgress(
              this.asStudent(actor, student.id),
              unit.id,
            )),
          })),
        );

        const overall =
          perUnit.length === 0
            ? 0
            : Math.round(
                perUnit.reduce((sum, u) => sum + u.overallPercent, 0) / perUnit.length,
              );

        return {
          studentId: student.id,
          fullName: student.studentProfile?.fullName ?? student.username,
          username: student.username,
          overallPercent: overall,
          lastActivityAt: await this.lastActivity(schoolId, student.id),
          unreadFromStudent: await this.unreadForTeacher(schoolId, actor.userId, student.id),
          units: perUnit,
        };
      }),
    );

    return { units, students: rows };
  }

  /** One student, in detail. */
  async studentDetail(actor: CurrentUser, studentId: string) {
    const schoolId = this.schoolOf(actor);

    const student = await this.prisma.forSchool(schoolId, (tx) =>
      tx.user.findFirst({
        where: { id: studentId, ...this.scopeFor(actor) },
        include: { studentProfile: true },
      }),
    );

    // Not "forbidden": saying a student exists but is not hers already tells
    // her something about another teacher's roster (SRS 35).
    if (!student) throw new NotFoundException('Student not found.');

    const units = await this.prisma.forSchool(schoolId, (tx) =>
      tx.unit.findMany({
        where: { status: ContentStatus.PUBLISHED },
        orderBy: { orderIndex: 'asc' },
      }),
    );

    const asStudent = this.asStudent(actor, studentId);

    const perUnit = await Promise.all(
      units.map(async (unit) => {
        const progress = await this.learning.unitProgress(asStudent, unit.id);

        const [words, attempts] = await this.prisma.forSchool(schoolId, async (tx) => [
          await tx.vocabularyItem.findMany({
            where: { unitId: unit.id, status: ContentStatus.PUBLISHED },
            orderBy: { orderIndex: 'asc' },
            select: { id: true, wordEn: true, meaningAr: true },
          }),
          await tx.activityAttempt.findMany({
            where: { studentId, unitId: unit.id, status: AttemptStatus.SUBMITTED },
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              purpose: true,
              submittedAt: true,
              scorePercent: true,
              correctCount: true,
              incorrectCount: true,
              passMarkPercent: true,
              passed: true,
            },
          }),
        ]);

        const wordProgress = await this.prisma.forSchool(schoolId, (tx) =>
          tx.vocabularyProgress.findMany({
            where: { studentId, itemId: { in: words.map((w) => w.id) } },
          }),
        );

        const byItem = new Map(wordProgress.map((p) => [p.itemId, p]));

        return {
          unitId: unit.id,
          title: unit.title,
          progress,
          attempts,
          // Word by word, so she can see exactly where a student is stuck.
          words: words.map((word) => {
            const p = byItem.get(word.id);
            return {
              id: word.id,
              wordEn: word.wordEn,
              meaningAr: word.meaningAr,
              seen: Boolean(p?.seenAt),
              audioPlayed: Boolean(p?.audioPlayedAt),
              checked: Boolean(p?.verifiedAt),
              learned: Boolean(p?.learnedAt),
              checkAttempts: p?.checkAttempts ?? 0,
            };
          }),
        };
      }),
    );

    return {
      studentId: student.id,
      fullName: student.studentProfile?.fullName ?? student.username,
      username: student.username,
      lastLoginAt: student.lastLoginAt,
      lastActivityAt: await this.lastActivity(schoolId, studentId),
      units: perUnit,
    };
  }

  /**
   * One finished attempt, question by question.
   *
   * This is what a teacher needs to help: not "6 out of 10" but which six, and
   * what the student wrote for the four she got wrong. Everything comes from
   * the attempt's own frozen snapshots, so an old paper reads exactly as it
   * was sat even after the questions behind it have been corrected.
   */
  async attemptDetail(actor: CurrentUser, attemptId: string) {
    const schoolId = this.schoolOf(actor);

    const attempt = await this.prisma.forSchool(schoolId, (tx) =>
      tx.activityAttempt.findFirst({
        where: {
          id: attemptId,
          status: AttemptStatus.SUBMITTED,
          // Her own students only, the same rule as everything else here.
          student: this.scopeFor(actor),
        },
        include: {
          answers: { orderBy: { orderIndex: 'asc' } },
          unit: { select: { id: true, title: true } },
          student: { include: { studentProfile: true } },
        },
      }),
    );

    if (!attempt) throw new NotFoundException('Attempt not found.');

    return {
      id: attempt.id,
      purpose: attempt.purpose,
      unit: attempt.unit,
      student: {
        id: attempt.student.id,
        fullName: attempt.student.studentProfile?.fullName ?? attempt.student.username,
      },
      submittedAt: attempt.submittedAt,
      correctCount: attempt.correctCount,
      incorrectCount: attempt.incorrectCount,
      pointsAwarded: attempt.pointsAwarded,
      pointsAvailable: attempt.pointsAvailable,
      scorePercent: attempt.scorePercent,
      passMarkPercent: attempt.passMarkPercent,
      passed: attempt.passed,
      questions: attempt.answers.map((answer) => {
        const snapshot = answer.snapshot as unknown as QuestionSnapshot;
        return {
          answerId: answer.id,
          orderIndex: answer.orderIndex,
          typeKey: snapshot.typeKey,
          prompt: snapshot.prompt,
          payload: snapshot.payload,
          points: snapshot.points,
          media: snapshot.media ?? [],
          response: answer.response ?? null,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          // The answer that was right on the day she sat it.
          expected: snapshot.answerKey,
        };
      }),
    };
  }

  /**
   * Reads another student's progress as though we were her.
   *
   * The learning service works from the caller's own id on purpose, so that a
   * student can only ever read her own. A teacher looking at her class needs
   * the same calculation for someone else, so the id is swapped here — behind
   * the scoping check above, which has already established this student is
   * hers, and inside the school the database is already limiting her to.
   */
  private asStudent(actor: CurrentUser, studentId: string): CurrentUser {
    return {
      ...actor,
      sub: studentId,
      userId: studentId,
      role: UserRole.STUDENT,
    };
  }

  /**
   * When she last did something that counts as learning.
   *
   * Signing in is not learning, so it is not this. A word looked at, a lesson
   * read, or an activity finished is.
   */
  private async lastActivity(schoolId: string, studentId: string): Promise<Date | null> {
    return this.prisma.forSchool(schoolId, async (tx) => {
      const [word, section, attempt] = await Promise.all([
        tx.vocabularyProgress.findFirst({
          where: { studentId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        tx.sectionProgress.findFirst({
          where: { studentId },
          orderBy: { viewedAt: 'desc' },
          select: { viewedAt: true },
        }),
        tx.activityAttempt.findFirst({
          where: { studentId, status: AttemptStatus.SUBMITTED },
          orderBy: { submittedAt: 'desc' },
          select: { submittedAt: true },
        }),
      ]);

      const times = [word?.updatedAt, section?.viewedAt, attempt?.submittedAt].filter(
        (t): t is Date => t instanceof Date,
      );

      if (times.length === 0) return null;

      return times.reduce((latest, t) => (t > latest ? t : latest));
    });
  }

  private async unreadForTeacher(
    schoolId: string,
    teacherId: string,
    studentId: string,
  ): Promise<number> {
    return this.prisma.forSchool(schoolId, (tx) =>
      tx.message.count({
        where: { teacherId, studentId, senderId: studentId, readAt: null },
      }),
    );
  }
}
