import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, UserRole } from '@prisma/client';
import { PrismaService, TenantClient } from '../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import {
  CreateSectionDto,
  CreateUnitDto,
  CreateVocabularyDto,
  UpdateSectionDto,
  UpdateUnitDto,
  UpdateVocabularyDto,
  UploadImageDto,
} from './dto/content.dto';

/**
 * The curriculum: units, their sections, and vocabulary.
 *
 * Shaped from the supplied TOP GOAL material, which divides each unit into
 * nine numbered sections. Section kinds are rows in `section_types`, not
 * values in code, so a curriculum with different sections needs no rebuild
 * (SRS 44, 45).
 *
 * Nothing here writes curriculum content of its own. Everything is entered or
 * imported and then approved by the teacher (SRS 32, 37.7).
 */
/** The examples a teacher entered on a section, if any. */
function readExamples(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const examples = (config as { examples?: unknown }).examples;
  if (!Array.isArray(examples)) return [];
  return examples.filter((e): e is string => typeof e === 'string');
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /** Students see published content only; teachers also see their drafts. */
  private visibleStatuses(actor: CurrentUser): ContentStatus[] {
    return actor.role === UserRole.STUDENT
      ? [ContentStatus.PUBLISHED]
      : [ContentStatus.DRAFT, ContentStatus.PUBLISHED];
  }

  /** The kinds of section this curriculum uses. Reference data, not per school. */
  async listSectionTypes() {
    return this.prisma.sectionType.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
  }

  // --- Courses -------------------------------------------------------------

  /**
   * The course a teacher works in, created on first use.
   *
   * One course exists today (TOP GOAL, Grade 6). It is created lazily rather
   * than seeded, so no curriculum is invented before the teacher asks for one.
   */
  async currentCourse(actor: CurrentUser) {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const existing = await tx.course.findFirst({ orderBy: { createdAt: 'asc' } });
      if (existing) return existing;

      if (actor.role === UserRole.STUDENT) {
        throw new NotFoundException('No course has been set up yet.');
      }

      return tx.course.create({
        data: { title: 'TOP GOAL', ownerSchoolId: schoolId, status: ContentStatus.DRAFT },
      });
    });
  }

  // --- Units ---------------------------------------------------------------

  async listUnits(actor: CurrentUser) {
    const course = await this.currentCourse(actor);

    return this.prisma.forSchool(this.schoolOf(actor), (tx) =>
      tx.unit.findMany({
        where: { courseId: course.id, status: { in: this.visibleStatuses(actor) } },
        orderBy: { orderIndex: 'asc' },
        include: {
          _count: { select: { sections: true, vocabularyItems: true } },
        },
      }),
    );
  }

  async getUnit(actor: CurrentUser, unitId: string) {
    const statuses = this.visibleStatuses(actor);

    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: { in: statuses } },
        include: {
          sections: {
            where: { status: { in: statuses } },
            orderBy: { orderIndex: 'asc' },
            include: { type: true, media: { orderBy: { orderIndex: 'asc' } } },
          },
          vocabularyItems: {
            where: { status: { in: statuses } },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!unit) throw new NotFoundException('Unit not found.');

      // Examples are held inside `config`; they are lifted out here so every
      // caller reads them the same way rather than each unpacking the JSON.
      return {
        ...unit,
        sections: unit.sections.map((section) => ({
          ...section,
          examples: readExamples(section.config),
        })),
      };
    });
  }

  async createUnit(actor: CurrentUser, dto: CreateUnitDto) {
    const course = await this.currentCourse(actor);
    const schoolId = this.schoolOf(actor);

    const unit = await this.prisma.forSchool(schoolId, async (tx) => {
      const last = await tx.unit.findFirst({
        where: { courseId: course.id },
        orderBy: { orderIndex: 'desc' },
      });

      return tx.unit.create({
        data: {
          courseId: course.id,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          title: dto.title,
          kind: dto.kind ?? null,
          description: dto.description ?? null,
          // New content is never visible to students until approved (SRS 37.7).
          status: ContentStatus.DRAFT,
        },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_CREATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'unit',
      targetId: unit.id,
    });

    return unit;
  }

  async updateUnit(actor: CurrentUser, unitId: string, dto: UpdateUnitDto) {
    const schoolId = this.schoolOf(actor);

    const unit = await this.prisma.forSchool(schoolId, async (tx) => {
      await this.mustFindUnit(tx, unitId);

      if (dto.orderIndex !== undefined) {
        await this.shiftUnitOrder(tx, unitId, dto.orderIndex);
      }

      return tx.unit.update({
        where: { id: unitId },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind || null } : {}),
          ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_UPDATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'unit',
      targetId: unitId,
    });

    return unit;
  }

  async setUnitStatus(actor: CurrentUser, unitId: string, status: ContentStatus) {
    const schoolId = this.schoolOf(actor);

    const unit = await this.prisma.forSchool(schoolId, async (tx) => {
      await this.mustFindUnit(tx, unitId);
      return tx.unit.update({ where: { id: unitId }, data: { status } });
    });

    await this.audit.record({
      action:
        status === ContentStatus.PUBLISHED
          ? AUDIT_ACTIONS.CONTENT_PUBLISHED
          : AUDIT_ACTIONS.CONTENT_UNPUBLISHED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'unit',
      targetId: unitId,
    });

    return unit;
  }

  async deleteUnit(actor: CurrentUser, unitId: string) {
    const schoolId = this.schoolOf(actor);

    await this.prisma.forSchool(schoolId, async (tx) => {
      await this.mustFindUnit(tx, unitId);
      await tx.unit.delete({ where: { id: unitId } });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_DELETED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'unit',
      targetId: unitId,
    });
  }

  // --- Sections ------------------------------------------------------------

  async createSection(actor: CurrentUser, unitId: string, dto: CreateSectionDto) {
    const schoolId = this.schoolOf(actor);

    const section = await this.prisma.forSchool(schoolId, async (tx) => {
      await this.mustFindUnit(tx, unitId);

      const type = await tx.sectionType.findUnique({ where: { key: dto.typeKey } });
      if (!type) throw new NotFoundException(`Unknown section type "${dto.typeKey}".`);

      const last = await tx.unitSection.findFirst({
        where: { unitId },
        orderBy: { orderIndex: 'desc' },
      });

      return tx.unitSection.create({
        data: {
          unitId,
          typeKey: dto.typeKey,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          title: dto.title ?? type.displayName,
          body: dto.body ?? null,
          status: ContentStatus.DRAFT,
        },
        include: { type: true },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_CREATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'section',
      targetId: section.id,
    });

    return section;
  }

  async updateSection(actor: CurrentUser, sectionId: string, dto: UpdateSectionDto) {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const section = await tx.unitSection.findUnique({ where: { id: sectionId } });
      if (!section) throw new NotFoundException('Section not found.');

      // Examples live in `config`, which is where a section keeps what one
      // kind needs and another does not — the alternative was a column that
      // only grammar would ever use.
      const config =
        dto.examples === undefined
          ? undefined
          : {
              ...((section.config as Record<string, unknown>) ?? {}),
              examples: dto.examples.map((e) => e.trim()).filter((e) => e !== ''),
            };

      return tx.unitSection.update({
        where: { id: sectionId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title || null } : {}),
          ...(dto.body !== undefined ? { body: dto.body || null } : {}),
          ...(config !== undefined ? { config: config as never } : {}),
          ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
        },
        include: { type: true, media: { orderBy: { orderIndex: 'asc' } } },
      });
    });
  }

  async setSectionStatus(actor: CurrentUser, sectionId: string, status: ContentStatus) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const section = await tx.unitSection.findUnique({ where: { id: sectionId } });
      if (!section) throw new NotFoundException('Section not found.');

      return tx.unitSection.update({ where: { id: sectionId }, data: { status } });
    });
  }

  async deleteSection(actor: CurrentUser, sectionId: string) {
    await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const section = await tx.unitSection.findUnique({ where: { id: sectionId } });
      if (!section) throw new NotFoundException('Section not found.');

      await tx.unitSection.delete({ where: { id: sectionId } });
    });
  }

  // --- Pictures ------------------------------------------------------------

  /**
   * The kinds of picture that may be uploaded.
   *
   * An allowlist, not a blocklist. SVG is deliberately absent: an SVG is a
   * document that can carry script, and this one would be served from the
   * API's own origin.
   */
  private static readonly ALLOWED_IMAGE_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ] as const;

  /** Two megabytes. Large enough for a worksheet scan, small enough to serve. */
  private static readonly MAX_IMAGE_BYTES = 2 * 1024 * 1024;

  /**
   * Attaches a picture to a section.
   *
   * The file is kept in the database for the pilot. That needs no new service,
   * works the moment the API is deployed, and can be moved to object storage
   * later behind the same `url`, which is the only thing anything reads. It is
   * a choice for the size of this pilot, not a permanent one — see
   * docs/CURRICULUM-FINDINGS.md.
   */
  async addSectionImage(actor: CurrentUser, sectionId: string, dto: UploadImageDto) {
    const schoolId = this.schoolOf(actor);

    if (!ContentService.ALLOWED_IMAGE_TYPES.includes(dto.mimeType as never)) {
      throw new BadRequestException(
        'That kind of file cannot be used. Please upload a PNG, JPEG, WEBP or GIF picture.',
      );
    }

    // Typed to its own ArrayBuffer, which is what Prisma's Bytes column wants.
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      // The browser sends "data:image/png;base64,…"; only the part after the
      // comma is the file.
      const base64 = dto.data.includes(',') ? dto.data.split(',')[1] : dto.data;
      const buffer = Buffer.from(base64, 'base64');
      // Copied into a plain byte array: Prisma's Bytes wants one backed by its
      // own ArrayBuffer, and a Buffer is a view into a shared pool.
      bytes = new Uint8Array(buffer.byteLength);
      bytes.set(buffer);
    } catch {
      throw new BadRequestException('That picture could not be read. Please try another file.');
    }

    if (bytes.length === 0) {
      throw new BadRequestException('That picture is empty.');
    }

    if (bytes.length > ContentService.MAX_IMAGE_BYTES) {
      throw new BadRequestException('That picture is too large. The limit is 2 MB.');
    }

    const asset = await this.prisma.forSchool(schoolId, async (tx) => {
      const section = await tx.unitSection.findUnique({ where: { id: sectionId } });
      if (!section) throw new NotFoundException('Section not found.');

      const last = await tx.mediaAsset.findFirst({
        where: { sectionId },
        orderBy: { orderIndex: 'desc' },
      });

      const created = await tx.mediaAsset.create({
        data: {
          sectionId,
          // Filled in below, once the row has an id to address it by.
          url: '',
          mimeType: dto.mimeType,
          altText: dto.altText?.trim() || null,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          data: bytes,
          byteSize: bytes.length,
        },
      });

      return tx.mediaAsset.update({
        where: { id: created.id },
        data: { url: `/api/v1/content/images/${created.id}` },
        select: { id: true, url: true, mimeType: true, altText: true, byteSize: true },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_UPDATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'section_image',
      targetId: asset.id,
    });

    return asset;
  }

  /**
   * Serves a picture.
   *
   * Published pictures are open to students; a draft one is the teacher's
   * alone, exactly like the section it belongs to.
   */
  async getImage(actor: CurrentUser, imageId: string) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const asset = await tx.mediaAsset.findFirst({
        where: {
          id: imageId,
          section: { status: { in: this.visibleStatuses(actor) } },
        },
      });

      if (!asset?.data) throw new NotFoundException('Picture not found.');

      return {
        data: Buffer.from(asset.data),
        mimeType: asset.mimeType,
      };
    });
  }

  async removeSectionImage(actor: CurrentUser, imageId: string) {
    await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const asset = await tx.mediaAsset.findUnique({ where: { id: imageId } });
      if (!asset) throw new NotFoundException('Picture not found.');

      await tx.mediaAsset.delete({ where: { id: imageId } });
    });
  }

  // --- Vocabulary ----------------------------------------------------------

  async addVocabulary(actor: CurrentUser, unitId: string, dto: CreateVocabularyDto) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      await this.mustFindUnit(tx, unitId);

      const last = await tx.vocabularyItem.findFirst({
        where: { unitId },
        orderBy: { orderIndex: 'desc' },
      });

      // A unit holds each word once. Adding one that is already there is an
      // ordinary mistake, not a server fault, so it gets a message the
      // teacher can act on rather than an error page.
      const duplicate = await tx.vocabularyItem.findFirst({
        where: { unitId, wordEn: dto.wordEn },
      });

      if (duplicate) {
        throw new ConflictException('That word is already in this unit.');
      }

      return tx.vocabularyItem.create({
        data: {
          unitId,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          wordEn: dto.wordEn,
          meaningAr: dto.meaningAr ?? null,
          partOfSpeech: dto.partOfSpeech ?? null,
          exampleSentence: dto.exampleSentence ?? null,
          status: ContentStatus.DRAFT,
        },
      });
    });
  }

  async updateVocabulary(actor: CurrentUser, itemId: string, dto: UpdateVocabularyDto) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const item = await tx.vocabularyItem.findUnique({ where: { id: itemId } });
      if (!item) throw new NotFoundException('Word not found.');

      // Renaming a word onto one the unit already has, same as adding one.
      if (dto.wordEn && dto.wordEn !== item.wordEn) {
        const clash = await tx.vocabularyItem.findFirst({
          where: { unitId: item.unitId, wordEn: dto.wordEn },
        });

        if (clash) throw new ConflictException('That word is already in this unit.');
      }

      return tx.vocabularyItem.update({
        where: { id: itemId },
        data: {
          ...(dto.wordEn ? { wordEn: dto.wordEn } : {}),
          ...(dto.meaningAr !== undefined ? { meaningAr: dto.meaningAr || null } : {}),
          ...(dto.partOfSpeech !== undefined ? { partOfSpeech: dto.partOfSpeech || null } : {}),
          ...(dto.exampleSentence !== undefined
            ? { exampleSentence: dto.exampleSentence || null }
            : {}),
          ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
        },
      });
    });
  }

  async setVocabularyStatus(actor: CurrentUser, itemId: string, status: ContentStatus) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const item = await tx.vocabularyItem.findUnique({ where: { id: itemId } });
      if (!item) throw new NotFoundException('Word not found.');

      return tx.vocabularyItem.update({ where: { id: itemId }, data: { status } });
    });
  }

  async deleteVocabulary(actor: CurrentUser, itemId: string) {
    await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const item = await tx.vocabularyItem.findUnique({ where: { id: itemId } });
      if (!item) throw new NotFoundException('Word not found.');

      await tx.vocabularyItem.delete({ where: { id: itemId } });
    });
  }

  /**
   * Publishes a unit and everything inside it in one step.
   *
   * Approving unit by unit is what the teacher actually does after reviewing
   * imported material, rather than approving each word separately.
   */
  async publishUnitTree(actor: CurrentUser, unitId: string) {
    const schoolId = this.schoolOf(actor);

    const counts = await this.prisma.forSchool(schoolId, async (tx) => {
      await this.mustFindUnit(tx, unitId);

      const sections = await tx.unitSection.updateMany({
        where: { unitId, status: ContentStatus.DRAFT },
        data: { status: ContentStatus.PUBLISHED },
      });
      const words = await tx.vocabularyItem.updateMany({
        where: { unitId, status: ContentStatus.DRAFT },
        data: { status: ContentStatus.PUBLISHED },
      });

      // Questions too, otherwise approving a unit gives the students a unit
      // with nothing to do. The one exception is the rule that matters: a
      // question the import could not read the answer for stays a draft
      // however the unit is approved, and is reported so the teacher knows
      // what is still waiting for her.
      const questions = await tx.question.updateMany({
        where: { unitId, status: ContentStatus.DRAFT, needsReview: false },
        data: { status: ContentStatus.PUBLISHED },
      });
      const heldBack = await tx.question.count({
        where: { unitId, needsReview: true },
      });

      await tx.unit.update({ where: { id: unitId }, data: { status: ContentStatus.PUBLISHED } });

      return {
        sections: sections.count,
        words: words.count,
        questions: questions.count,
        questionsNeedingReview: heldBack,
      };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_PUBLISHED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'unit',
      targetId: unitId,
      metadata: counts,
    });

    return counts;
  }

  private async mustFindUnit(tx: TenantClient, unitId: string) {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found.');
    return unit;
  }

  /** Keeps unit ordering contiguous when one is moved. */
  private async shiftUnitOrder(tx: TenantClient, unitId: string, target: number) {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderIndex === target) return;

    const siblings = await tx.unit.findMany({
      where: { courseId: unit.courseId },
      orderBy: { orderIndex: 'asc' },
    });

    const reordered = siblings.filter((s) => s.id !== unitId);
    reordered.splice(Math.min(target, reordered.length), 0, unit);

    // Moved out of the way first, because orderIndex is unique per course.
    for (const [index, item] of reordered.entries()) {
      await tx.unit.update({ where: { id: item.id }, data: { orderIndex: -(index + 1000) } });
    }
    for (const [index, item] of reordered.entries()) {
      await tx.unit.update({ where: { id: item.id }, data: { orderIndex: index } });
    }
  }
}
