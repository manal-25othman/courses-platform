import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, Question, QuestionPurpose, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import { QuestionEngineService, StoredQuestion } from './question-engine.service';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';

/** A question as the teacher sees it, answer key included. */
export type TeacherQuestionView = Question;

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: QuestionEngineService,
    private readonly audit: AuditService,
  ) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /**
   * Questions in a unit. Teacher only: the answer keys are included.
   *
   * `purpose` separates the practice activities from the assessment. Left out,
   * it returns both, which is what an "everything in this unit" view wants.
   */
  async listForUnit(
    actor: CurrentUser,
    unitId: string,
    options: { onlyNeedingReview?: boolean; purpose?: QuestionPurpose } = {},
  ) {
    return this.prisma.forSchool(this.schoolOf(actor), (tx) =>
      tx.question.findMany({
        where: {
          unitId,
          ...(options.onlyNeedingReview ? { needsReview: true } : {}),
          ...(options.purpose ? { purpose: options.purpose } : {}),
        },
        orderBy: { orderIndex: 'asc' },
        include: {
          type: true,
          media: {
            orderBy: { orderIndex: 'asc' },
            select: { id: true, url: true, mimeType: true, altText: true },
          },
          section: { select: { id: true, title: true } },
        },
      }),
    );
  }

  /** How much of an imported unit still needs checking. */
  async reviewSummary(actor: CurrentUser, unitId: string) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const [total, needingReview, published, assessmentTotal, assessmentPublished] =
        await Promise.all([
          tx.question.count({ where: { unitId } }),
          tx.question.count({ where: { unitId, needsReview: true } }),
          tx.question.count({ where: { unitId, status: ContentStatus.PUBLISHED } }),
          tx.question.count({ where: { unitId, purpose: QuestionPurpose.ASSESSMENT } }),
          tx.question.count({
            where: {
              unitId,
              purpose: QuestionPurpose.ASSESSMENT,
              status: ContentStatus.PUBLISHED,
            },
          }),
        ]);

      return {
        total,
        needingReview,
        published,
        readyToPublish: total - needingReview - published,
        assessmentTotal,
        assessmentPublished,
      };
    });
  }

  async create(actor: CurrentUser, unitId: string, dto: CreateQuestionDto) {
    // Rejected before it is stored if the kind's own rules are not met.
    this.engine.assertValid(dto.typeKey, dto.payload, dto.answerKey);

    const schoolId = this.schoolOf(actor);

    const question = await this.prisma.forSchool(schoolId, async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id: unitId } });
      if (!unit) throw new NotFoundException('Unit not found.');

      const purpose = dto.purpose ?? QuestionPurpose.ACTIVITY;

      // Numbered within its own list, so the assessment reads 1, 2, 3 rather
      // than carrying on from where the practice questions left off.
      const last = await tx.question.findFirst({
        where: { unitId, purpose },
        orderBy: { orderIndex: 'desc' },
      });

      await this.assertSectionBelongsToUnit(tx, unitId, dto.sectionId);

      return tx.question.create({
        data: {
          unitId,
          typeKey: dto.typeKey,
          prompt: dto.prompt,
          payload: dto.payload as never,
          answerKey: dto.answerKey as never,
          points: dto.points ?? 1,
          purpose,
          sectionId: dto.sectionId ?? null,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          status: ContentStatus.DRAFT,
        },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_CREATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'question',
      targetId: question.id,
    });

    return question;
  }

  async update(actor: CurrentUser, questionId: string, dto: UpdateQuestionDto) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const existing = await tx.question.findUnique({ where: { id: questionId } });
      if (!existing) throw new NotFoundException('Question not found.');

      const payload = dto.payload ?? existing.payload;
      const answerKey = dto.answerKey ?? existing.answerKey;

      if (dto.payload || dto.answerKey) {
        this.engine.assertValid(existing.typeKey, payload, answerKey);
      }

      if (dto.sectionId !== undefined && dto.sectionId !== '') {
        await this.assertSectionBelongsToUnit(tx, existing.unitId, dto.sectionId);
      }

      return tx.question.update({
        where: { id: questionId },
        data: {
          ...(dto.prompt ? { prompt: dto.prompt } : {}),
          ...(dto.payload ? { payload: dto.payload as never } : {}),
          ...(dto.answerKey ? { answerKey: dto.answerKey as never } : {}),
          ...(dto.points ? { points: dto.points } : {}),
          ...(dto.purpose ? { purpose: dto.purpose } : {}),
          // An empty string is the teacher unlinking it from its section.
          ...(dto.sectionId === undefined ? {} : { sectionId: dto.sectionId || null }),
          // Clearing the flag is the teacher saying she has checked it.
          ...(dto.reviewed === true ? { needsReview: false, reviewNotes: null } : {}),
        },
      });
    });
  }

  /**
   * Publishes a question.
   *
   * A question the import was unsure of cannot be published until a teacher
   * has confirmed it. Otherwise an uncertain answer could reach students and
   * mark them wrong for a correct response.
   */
  async setStatus(actor: CurrentUser, questionId: string, status: ContentStatus) {
    const schoolId = this.schoolOf(actor);

    const question = await this.prisma.forSchool(schoolId, async (tx) => {
      const existing = await tx.question.findUnique({ where: { id: questionId } });
      if (!existing) throw new NotFoundException('Question not found.');

      if (status === ContentStatus.PUBLISHED && existing.needsReview) {
        throw new BadRequestException(
          'This question still needs checking. Confirm it before publishing.',
        );
      }

      if (status === ContentStatus.PUBLISHED) {
        // A question that cannot be marked must never reach a student.
        this.engine.assertValid(existing.typeKey, existing.payload, existing.answerKey);
      }

      return tx.question.update({ where: { id: questionId }, data: { status } });
    });

    await this.audit.record({
      action:
        status === ContentStatus.PUBLISHED
          ? AUDIT_ACTIONS.CONTENT_PUBLISHED
          : AUDIT_ACTIONS.CONTENT_UNPUBLISHED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'question',
      targetId: questionId,
    });

    return question;
  }

  async remove(actor: CurrentUser, questionId: string) {
    await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const existing = await tx.question.findUnique({ where: { id: questionId } });
      if (!existing) throw new NotFoundException('Question not found.');

      await tx.question.delete({ where: { id: questionId } });
    });
  }

  /**
   * Shows a unit's published questions as a student would see them.
   *
   * Everything here goes through the engine, so no answer key is included and
   * the order follows the seed.
   */
  async preview(actor: CurrentUser, unitId: string, seed: string, purpose?: QuestionPurpose) {
    const questions = await this.prisma.forSchool(this.schoolOf(actor), (tx) =>
      tx.question.findMany({
        where: { unitId, status: ContentStatus.PUBLISHED, ...(purpose ? { purpose } : {}) },
        orderBy: { orderIndex: 'asc' },
      }),
    );

    const stored: StoredQuestion[] = questions.map((q) => ({
      id: q.id,
      typeKey: q.typeKey,
      prompt: q.prompt,
      payload: q.payload,
      answerKey: q.answerKey,
      points: q.points,
    }));

    return this.engine.present(stored, {
      seed,
      shuffleQuestions: true,
      shuffleOptions: true,
    });
  }

  /** The kinds the engine supports, with whether the source uses each. */
  async listTypes() {
    return this.prisma.questionType.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
  }

  /**
   * A question may only be linked to a grammar section in its own unit.
   *
   * Row-level security already stops another school's section being named
   * here. This stops a section from the wrong unit of her own course, which
   * would send a student to an explanation for a different lesson.
   */
  private async assertSectionBelongsToUnit(
    tx: { unitSection: { findUnique: (args: { where: { id: string } }) => Promise<{ unitId: string } | null> } },
    unitId: string,
    sectionId?: string,
  ): Promise<void> {
    if (!sectionId) return;

    const section = await tx.unitSection.findUnique({ where: { id: sectionId } });
    if (!section || section.unitId !== unitId) {
      throw new BadRequestException('That grammar section is not part of this unit.');
    }
  }

  /** Only a teacher may see an answer key, and only for her own school. */
  assertTeacher(actor: CurrentUser): void {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
  }
}
