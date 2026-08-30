import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ContentStatus, UserRole } from '@prisma/client';
import { ContentService } from './content.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';

const SCHOOL = 'school-1';

const teacher: CurrentUser = {
  sub: 't1', userId: 't1', role: UserRole.TEACHER, schoolId: SCHOOL, mustChangePassword: false,
};
const student: CurrentUser = { ...teacher, sub: 's1', userId: 's1', role: UserRole.STUDENT };

/** Records the filters the service builds, which is what hides drafts. */
function serviceCapturing(captured: {
  unitWhere?: Record<string, unknown>;
  questionWhere?: Record<string, unknown>;
  school?: string;
}) {
  const tx = {
    course: {
      findFirst: async () => ({ id: 'course-1', ownerSchoolId: SCHOOL }),
      create: async () => ({ id: 'course-1', ownerSchoolId: SCHOOL }),
    },
    unit: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        captured.unitWhere = args.where;
        return [];
      },
      findFirst: async (args: { where: Record<string, unknown> }) => {
        captured.unitWhere = args.where;
        return null;
      },
      findUnique: async () => ({ id: 'u1', courseId: 'course-1', orderIndex: 0 }),
      create: async (args: { data: Record<string, unknown> }) => ({ id: 'u1', ...args.data }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    unitSection: { updateMany: async () => ({ count: 3 }) },
    vocabularyItem: { updateMany: async () => ({ count: 5 }) },
    question: {
      updateMany: async (args: { where: Record<string, unknown> }) => {
        captured.questionWhere = args.where;
        return { count: 7 };
      },
      count: async () => 2,
    },
    sectionType: { findMany: async () => [], findUnique: async () => null },
  };

  const prisma = {
    forSchool: async <T>(schoolId: string, work: (t: typeof tx) => Promise<T>) => {
      captured.school = schoolId;
      return work(tx);
    },
    sectionType: tx.sectionType,
  } as unknown as PrismaService;

  return new ContentService(prisma, { record: vi.fn() } as unknown as AuditService);
}

describe('ContentService draft visibility', () => {
  let captured: {
    unitWhere?: Record<string, unknown>;
    questionWhere?: Record<string, unknown>;
    school?: string;
  };
  let service: ContentService;

  beforeEach(() => {
    captured = {};
    service = serviceCapturing(captured);
  });

  /**
   * The rule that keeps unapproved material away from students. Imported
   * content stays a draft until the teacher approves it (SRS 32, 37.7).
   */
  it('shows a student only published content', async () => {
    await service.listUnits(student);

    expect(captured.unitWhere?.status).toEqual({ in: [ContentStatus.PUBLISHED] });
  });

  it('shows a teacher her drafts as well', async () => {
    await service.listUnits(teacher);

    expect(captured.unitWhere?.status).toEqual({
      in: [ContentStatus.DRAFT, ContentStatus.PUBLISHED],
    });
  });

  it('applies the same rule when a student opens one unit by id', async () => {
    await service.getUnit(student, 'unit-1').catch(() => undefined);

    expect(captured.unitWhere?.status).toEqual({ in: [ContentStatus.PUBLISHED] });
  });

  it('runs every query inside the school from the token', async () => {
    await service.listUnits(teacher);

    expect(captured.school).toBe(SCHOOL);
  });

  it('creates new units as drafts, never visible straight away', async () => {
    const unit = await service.createUnit(teacher, { title: 'Living Things' });

    expect((unit as { status: ContentStatus }).status).toBe(ContentStatus.DRAFT);
  });

  it('refuses an account with no school', async () => {
    await expect(
      service.listUnits({ ...teacher, schoolId: null }),
    ).rejects.toThrow(/not attached to a school/i);
  });

  it('publishes a unit together with its sections, words and questions', async () => {
    const result = await service.publishUnitTree(teacher, 'unit-1');

    expect(result).toEqual({
      sections: 3,
      words: 5,
      questions: 7,
      questionsNeedingReview: 2,
    });
  });

  /**
   * The rule that stops an unread answer key reaching a student. Approving a
   * whole unit must not be a way round the check that publishing one question
   * enforces.
   */
  it('never publishes a question that still needs checking', async () => {
    await service.publishUnitTree(teacher, 'unit-1');

    expect(captured.questionWhere?.needsReview).toBe(false);
  });
});

/**
 * A word a unit already has is a mistake the teacher can fix, so it has to
 * come back as a clear refusal. Left to the database's unique index it
 * surfaced as an unhandled error and the screen showed a server fault.
 */
describe('ContentService duplicate vocabulary', () => {
  function serviceWithWords(existing: { id: string; unitId: string; wordEn: string }[]) {
    const tx = {
      unit: { findUnique: async () => ({ id: 'u1', courseId: 'course-1', orderIndex: 0 }) },
      course: { findFirst: async () => ({ id: 'course-1', ownerSchoolId: SCHOOL }) },
      vocabularyItem: {
        findFirst: async (args: { where: { unitId: string; wordEn?: string } }) => {
          if (args.where.wordEn === undefined) {
            return existing[existing.length - 1] ?? null;
          }
          return existing.find((w) => w.unitId === args.where.unitId && w.wordEn === args.where.wordEn) ?? null;
        },
        findUnique: async (args: { where: { id: string } }) =>
          existing.find((w) => w.id === args.where.id) ?? null,
        create: async (args: { data: Record<string, unknown> }) => ({ id: 'new', ...args.data }),
        update: async (args: { data: Record<string, unknown> }) => ({ id: 'v1', ...args.data }),
      },
    };

    const prisma = {
      forSchool: async <T>(_schoolId: string, work: (t: typeof tx) => Promise<T>) => work(tx),
    } as unknown as PrismaService;

    return new ContentService(prisma, { record: vi.fn() } as unknown as AuditService);
  }

  it('refuses a word the unit already has', async () => {
    const service = serviceWithWords([{ id: 'v1', unitId: 'u1', wordEn: 'lion' }]);

    await expect(
      service.addVocabulary(teacher, 'u1', { wordEn: 'lion' }),
    ).rejects.toThrow(/already in this unit/i);
  });

  it('accepts a word the unit does not have', async () => {
    const service = serviceWithWords([{ id: 'v1', unitId: 'u1', wordEn: 'lion' }]);

    const added = await service.addVocabulary(teacher, 'u1', { wordEn: 'mountain' });

    expect((added as { wordEn: string }).wordEn).toBe('mountain');
  });

  it('refuses renaming a word onto one already there', async () => {
    const service = serviceWithWords([
      { id: 'v1', unitId: 'u1', wordEn: 'lion' },
      { id: 'v2', unitId: 'u1', wordEn: 'mountain' },
    ]);

    await expect(
      service.updateVocabulary(teacher, 'v1', { wordEn: 'mountain' }),
    ).rejects.toThrow(/already in this unit/i);
  });

  it('allows saving a word without changing its spelling', async () => {
    const service = serviceWithWords([{ id: 'v1', unitId: 'u1', wordEn: 'lion' }]);

    await expect(
      service.updateVocabulary(teacher, 'v1', { wordEn: 'lion', meaningAr: 'أسد' }),
    ).resolves.toBeDefined();
  });
});
