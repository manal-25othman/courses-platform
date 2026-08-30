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
function serviceCapturing(captured: { unitWhere?: Record<string, unknown>; school?: string }) {
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
  let captured: { unitWhere?: Record<string, unknown>; school?: string };
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

  it('publishes a unit together with its sections and words', async () => {
    const result = await service.publishUnitTree(teacher, 'unit-1');

    expect(result).toEqual({ sections: 3, words: 5 });
  });
});
