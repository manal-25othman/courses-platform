import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, SettingScope, UserRole } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { SETTING_KEYS } from '../settings/settings.types';
import { readVideoUrl, UnsupportedVideoError } from './video';
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
    private readonly settings: SettingsService,
  ) {}

  /** Where to look for a setting that a unit may override. */
  private unitScopes(unitId: string) {
    return [{ scope: SettingScope.UNIT, scopeId: unitId }];
  }

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
   * The course this school works in, created on first use.
   *
   * One course exists per school today (TOP GOAL, Grade 6). It is created
   * lazily rather than seeded, so no curriculum is invented before the teacher
   * asks for one.
   *
   * The school is named in the query rather than left to row-level security.
   * The policy on `courses` deliberately admits a shared master library as
   * well as this school's own rows, so "the oldest course I can see" is not
   * the same question as "my school's course" — it once resolved to another
   * school's curriculum. A school works in the course it owns; adopting shared
   * material is a separate, deliberate act, not something course resolution
   * does on its own.
   */
  async currentCourse(actor: CurrentUser) {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const existing = await tx.course.findFirst({
        where: { ownerSchoolId: schoolId },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) return existing;

      if (actor.role === UserRole.STUDENT) {
        throw new NotFoundException('No course has been set up yet.');
      }

      return tx.course.create({
        data: {
          title: 'TOP GOAL',
          ownerSchoolId: schoolId,
          // A school's own curriculum is private to it.
          isSharedMaster: false,
          status: ContentStatus.DRAFT,
        },
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

  /**
   * The course and its units, with enough about each to say what is there and
   * what is missing.
   *
   * Built for the teacher's Curriculum screen, which needs a count per part of
   * the unit rather than the whole of every unit. The counts are gathered in
   * three grouped queries over all the units at once rather than one query per
   * unit, so a course with thirty units costs the same as one with four.
   *
   * Everything returned is counted from stored rows. Nothing here judges the
   * material — how a teacher reads "no test questions yet" is her business.
   */
  async curriculumOverview(actor: CurrentUser) {
    const course = await this.currentCourse(actor);
    const schoolId = this.schoolOf(actor);
    const statuses = this.visibleStatuses(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const units = await tx.unit.findMany({
        where: { courseId: course.id, status: { in: statuses } },
        orderBy: { orderIndex: 'asc' },
        include: {
          sections: {
            where: { status: { in: statuses } },
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              typeKey: true,
              status: true,
              body: true,
              videoUrl: true,
              needsReview: true,
              type: { select: { progressComponent: true, displayName: true } },
              _count: { select: { media: true } },
            },
          },
        },
      });

      const unitIds = units.map((unit) => unit.id);
      if (unitIds.length === 0) {
        return { course, units: [] };
      }

      const [questionCounts, wordCounts, wordsMissingMeaning] = await Promise.all([
        tx.question.groupBy({
          // `needsReview` is grouped as well because a question awaiting a
          // teacher's eye is held out of the test even once published, so a
          // count that ignored it would overstate what a student will be
          // asked. See `assessmentPool` in the learning service, which this
          // mirrors.
          by: ['unitId', 'purpose', 'status', 'needsReview'],
          where: { unitId: { in: unitIds } },
          _count: { _all: true },
        }),
        tx.vocabularyItem.groupBy({
          by: ['unitId', 'status'],
          where: { unitId: { in: unitIds } },
          _count: { _all: true },
        }),
        tx.vocabularyItem.groupBy({
          by: ['unitId'],
          where: { unitId: { in: unitIds }, OR: [{ meaningAr: null }, { meaningAr: '' }] },
          _count: { _all: true },
        }),
      ]);

      const countOf = <T extends { unitId: string; _count: { _all: number } }>(
        rows: T[],
        unitId: string,
        match: (row: T) => boolean = () => true,
      ) =>
        rows
          .filter((row) => row.unitId === unitId && match(row))
          .reduce((total, row) => total + row._count._all, 0);

      return {
        course,
        units: units.map((unit) => {
          // Which section carries the grammar is a property of the section
          // type, not of its name, so a curriculum with differently named
          // sections needs no change here.
          const grammar = unit.sections.filter(
            (section) => section.type.progressComponent === 'grammar',
          );

          // A question is only asked once it is published and nobody has
          // flagged it for review.
          const settled = (purpose: 'ACTIVITY' | 'ASSESSMENT') =>
            countOf(
              questionCounts,
              unit.id,
              (r) =>
                r.purpose === purpose &&
                r.status === ContentStatus.PUBLISHED &&
                !r.needsReview,
            );

          const settledActivity = settled('ACTIVITY');
          const settledAssessment = settled('ASSESSMENT');

          return {
            id: unit.id,
            title: unit.title,
            kind: unit.kind,
            orderIndex: unit.orderIndex,
            status: unit.status,
            countsTowardCompletion: unit.countsTowardCompletion,
            vocabulary: {
              total: countOf(wordCounts, unit.id),
              published: countOf(wordCounts, unit.id, (r) => r.status === ContentStatus.PUBLISHED),
              missingMeaning: countOf(wordsMissingMeaning, unit.id),
            },
            grammar: {
              sections: grammar.length,
              published: grammar.filter((s) => s.status === ContentStatus.PUBLISHED).length,
              // A grammar page a student can learn from has something on it.
              withContent: grammar.filter(
                (s) => (s.body ?? '').trim() !== '' || s._count.media > 0 || s.videoUrl,
              ).length,
            },
            activity: {
              total: countOf(questionCounts, unit.id, (r) => r.purpose === 'ACTIVITY'),
              published: countOf(
                questionCounts,
                unit.id,
                (r) => r.purpose === 'ACTIVITY' && r.status === ContentStatus.PUBLISHED,
              ),
              asked: settledActivity,
            },
            assessment: {
              total: countOf(questionCounts, unit.id, (r) => r.purpose === 'ASSESSMENT'),
              published: countOf(
                questionCounts,
                unit.id,
                (r) => r.purpose === 'ASSESSMENT' && r.status === ContentStatus.PUBLISHED,
              ),
              asked: settledAssessment,
            },
            /**
             * Where this unit's test will actually draw its questions from.
             *
             * A unit with its own test questions uses them. A unit without any
             * falls back to its practice questions, which is why a unit
             * showing no test questions can still set a test — and why saying
             * "no test" on the strength of that count alone would be wrong.
             */
            testPool:
              settledAssessment > 0
                ? { source: 'assessment' as const, available: settledAssessment }
                : { source: 'activity' as const, available: settledActivity },
            sectionsNeedingReview: unit.sections.filter((s) => s.needsReview).length,
            questionsNeedingReview: countOf(questionCounts, unit.id, (r) => r.needsReview),
          };
        }),
      };
    });
  }

  /**
   * The rules that will govern this unit's test, as the platform will resolve
   * them when a student sits it.
   *
   * Read-only. These come from the settings store, where a value may be set
   * for this unit, the course, the school or everywhere, and the most specific
   * one wins. The teacher screens state them so a pass mark is never a number
   * a teacher has to guess at; changing one is not something any route here
   * does.
   */
  async assessmentRules(actor: CurrentUser, unitId: string) {
    const schoolId = this.schoolOf(actor);

    // Proves the unit is hers before any setting is read, so the rules of a
    // unit in another school are not readable either.
    await this.prisma.forSchool(schoolId, async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, course: { ownerSchoolId: schoolId } },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Unit not found.');
    });

    const scopes = this.unitScopes(unitId);
    const [passingScore, maxAttempts, questionCount, resultPolicy] = await Promise.all([
      this.settings.resolve<number>(SETTING_KEYS.ASSESSMENT_PASSING_SCORE, scopes),
      this.settings.resolve<number | null>(SETTING_KEYS.ASSESSMENT_MAX_ATTEMPTS, scopes),
      this.settings.resolve<number | null>(SETTING_KEYS.ASSESSMENT_QUESTION_COUNT, scopes),
      this.settings.resolve<string>(SETTING_KEYS.ASSESSMENT_RESULT_POLICY, scopes),
    ]);

    return { passingScore, maxAttempts, questionCount, resultPolicy };
  }

  async getUnit(actor: CurrentUser, unitId: string) {
    const statuses = this.visibleStatuses(actor);
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const unit = await tx.unit.findFirst({
        // Named against this school's own course, so reaching a unit by its
        // identifier alone cannot cross a tenant even if the policy that
        // governs the row is ever loosened. A unit belonging to someone else
        // is "not found", which is also all a stranger should learn about it.
        where: { id: unitId, status: { in: statuses }, course: { ownerSchoolId: schoolId } },
        include: {
          sections: {
            where: { status: { in: statuses } },
            orderBy: { orderIndex: 'asc' },
            include: { type: true, media: { orderBy: { orderIndex: 'asc' } } },
          },
          vocabularyItems: {
            where: { status: { in: statuses } },
            orderBy: { orderIndex: 'asc' },
            include: { media: { orderBy: { orderIndex: 'asc' } } },
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

      // The video address is checked here, when she saves it, so an address
      // that cannot be played is a message on the form rather than an empty
      // frame for a student later. Only the address is stored; the player is
      // built from it when the page is drawn, so nothing she typed is ever
      // rendered as markup.
      let videoUrl: string | null | undefined;
      if (dto.videoUrl !== undefined) {
        const given = dto.videoUrl.trim();
        if (given === '') {
          videoUrl = null;
        } else {
          const hosts = await this.settings.resolve<string[]>(
            SETTING_KEYS.GRAMMAR_VIDEO_HOSTS,
            this.unitScopes(section.unitId),
          );
          try {
            videoUrl = readVideoUrl(given, hosts ?? []).url;
          } catch (error) {
            if (error instanceof UnsupportedVideoError) {
              throw new BadRequestException(error.message);
            }
            throw error;
          }
        }
      }

      return tx.unitSection.update({
        where: { id: sectionId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title || null } : {}),
          ...(dto.body !== undefined ? { body: dto.body || null } : {}),
          ...(config !== undefined ? { config: config as never } : {}),
          ...(videoUrl !== undefined ? { videoUrl } : {}),
          ...(dto.needsReview !== undefined ? { needsReview: dto.needsReview } : {}),
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

  /**
   * Recordings a teacher makes of a word.
   *
   * Only where a browser can play them back without a plugin, because the
   * point of a teacher recording is that a student who has no working voice
   * in her browser can still hear the word (client, 2026-08-31).
   */
  private static readonly ALLOWED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
  ] as const;

  /** Two megabytes. Large enough for a worksheet scan, small enough to serve. */
  private static readonly MAX_IMAGE_BYTES = 2 * 1024 * 1024;

  /**
   * Attaches a file to a section, a question or a word.
   *
   * One method for all three because the work is identical: check the kind of
   * file, decode it, check the size, find the parent, store the bytes and give
   * the row a URL that addresses itself. The database enforces that a row
   * names exactly one parent, so this cannot drift.
   *
   * The file is kept in the database for the pilot. That needs no new service,
   * works the moment the API is deployed, and can be moved to object storage
   * later behind the same `url`, which is the only thing anything reads. It is
   * a choice for the size of this pilot, not a permanent one — see
   * docs/CURRICULUM-FINDINGS.md.
   */
  /**
   * Whether a file's first bytes match the kind of file it says it is.
   *
   * A cheap, honest check and nothing more: every one of these formats begins
   * with a fixed marker, so a file that lacks its own marker is certainly not
   * that format and no student's browser will play it. It exists because a
   * teacher could upload anything at all as `audio/wav`, the recording would
   * be accepted, the vocabulary screen would offer it, and the file would
   * silently refuse to play — leaving a child unable to finish the word.
   *
   * What it deliberately does NOT claim: that a file which passes will play.
   * A truncated or corrupt recording with a correct header still gets in, and
   * the student's screen handles that case on its own. Deciding more than
   * this means decoding audio on the server, which is a great deal of
   * machinery for a small gain — an unknown type is therefore allowed rather
   * than guessed at.
   */
  private static looksLikeItsType(bytes: Uint8Array, mimeType: string): boolean {
    const starts = (...signature: number[]) =>
      signature.every((byte, index) => bytes[index] === byte);
    const ascii = (text: string, at = 0) =>
      [...text].every((character, index) => bytes[at + index] === character.charCodeAt(0));

    switch (mimeType) {
      case 'image/png':
        return starts(0x89, 0x50, 0x4e, 0x47);
      case 'image/jpeg':
        return starts(0xff, 0xd8, 0xff);
      case 'image/gif':
        return ascii('GIF8');
      case 'image/webp':
        return ascii('RIFF') && ascii('WEBP', 8);
      case 'audio/wav':
      case 'audio/x-wav':
      case 'audio/wave':
        return ascii('RIFF') && ascii('WAVE', 8);
      case 'audio/ogg':
        return ascii('OggS');
      case 'audio/webm':
        return starts(0x1a, 0x45, 0xdf, 0xa3);
      case 'audio/mpeg':
      case 'audio/mp3':
        // An ID3 tag, or a bare frame header.
        return ascii('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
      case 'audio/mp4':
      case 'audio/x-m4a':
      case 'audio/aac':
        return ascii('ftyp', 4);
      default:
        // A type this does not know is left alone rather than refused on a
        // guess: the allow-list above has already decided it is acceptable.
        return true;
    }
  }

  private async attachMedia(
    actor: CurrentUser,
    parent: { section: string } | { question: string } | { word: string },
    dto: UploadImageDto,
    allowAudio = false,
  ) {
    const schoolId = this.schoolOf(actor);

    const allowed: readonly string[] = allowAudio
      ? [...ContentService.ALLOWED_IMAGE_TYPES, ...ContentService.ALLOWED_AUDIO_TYPES]
      : ContentService.ALLOWED_IMAGE_TYPES;

    if (!allowed.includes(dto.mimeType)) {
      throw new BadRequestException(
        allowAudio
          ? 'That kind of file cannot be used. Please upload a PNG, JPEG, WEBP or GIF picture, or an MP3, M4A, OGG, WAV or WEBM recording.'
          : 'That kind of file cannot be used. Please upload a PNG, JPEG, WEBP or GIF picture.',
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
      throw new BadRequestException('That file could not be read. Please try another one.');
    }

    if (bytes.length === 0) {
      throw new BadRequestException('That file is empty.');
    }

    if (bytes.length > ContentService.MAX_IMAGE_BYTES) {
      throw new BadRequestException('That file is too large. The limit is 2 MB.');
    }

    if (!ContentService.looksLikeItsType(bytes, dto.mimeType)) {
      throw new BadRequestException(
        'That file does not look like the kind of file it claims to be, so a student’s ' +
          'browser would not be able to play or show it. Please upload it again.',
      );
    }

    const asset = await this.prisma.forSchool(schoolId, async (tx) => {
      // The parent must exist and belong to this school. Row-level security
      // would refuse the insert anyway; finding it first turns that into a
      // message the teacher can act on.
      const where =
        'section' in parent
          ? { sectionId: parent.section }
          : 'question' in parent
            ? { questionId: parent.question }
            : { vocabularyItemId: parent.word };

      const exists =
        'section' in parent
          ? await tx.unitSection.findUnique({ where: { id: parent.section } })
          : 'question' in parent
            ? await tx.question.findUnique({ where: { id: parent.question } })
            : await tx.vocabularyItem.findUnique({ where: { id: parent.word } });

      if (!exists) throw new NotFoundException('That has been removed. Reload the page.');

      const last = await tx.mediaAsset.findFirst({
        where,
        orderBy: { orderIndex: 'desc' },
      });

      const created = await tx.mediaAsset.create({
        data: {
          ...where,
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
        data: { url: `/api/v1/content/media/${created.id}` },
        select: { id: true, url: true, mimeType: true, altText: true, byteSize: true },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CONTENT_UPDATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'media_asset',
      targetId: asset.id,
    });

    return asset;
  }

  addSectionImage(actor: CurrentUser, sectionId: string, dto: UploadImageDto) {
    return this.attachMedia(actor, { section: sectionId }, dto);
  }

  /** A picture that is part of the question, such as "name what you see". */
  addQuestionImage(actor: CurrentUser, questionId: string, dto: UploadImageDto) {
    return this.attachMedia(actor, { question: questionId }, dto);
  }

  /**
   * A picture or a recording for one word.
   *
   * The recording is the fallback for a browser whose built-in voice does not
   * work. It never lets a student say she has heard a word — she still has to
   * play it (client, 2026-08-31).
   */
  addWordMedia(actor: CurrentUser, itemId: string, dto: UploadImageDto) {
    return this.attachMedia(actor, { word: itemId }, dto, true);
  }

  /**
   * Serves a file.
   *
   * Students may fetch one too, which is how a grammar page shows its image
   * and how a word plays its recording. Whether a student may see it is the
   * status of whatever it hangs off: a picture on a draft question is not
   * served to her, exactly as the question itself is not.
   */
  async getMedia(actor: CurrentUser, mediaId: string) {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const visible = { status: { in: this.visibleStatuses(actor) } };

      const asset = await tx.mediaAsset.findFirst({
        where: {
          id: mediaId,
          OR: [
            { section: visible },
            { question: visible },
            { vocabularyItem: visible },
          ],
        },
      });

      if (!asset?.data) throw new NotFoundException('File not found.');

      return {
        data: Buffer.from(asset.data),
        mimeType: asset.mimeType,
      };
    });
  }

  async removeMedia(actor: CurrentUser, mediaId: string) {
    await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const asset = await tx.mediaAsset.findUnique({ where: { id: mediaId } });
      if (!asset) throw new NotFoundException('File not found.');

      await tx.mediaAsset.delete({ where: { id: mediaId } });
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
