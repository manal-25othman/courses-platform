import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { StudentsService } from './students.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';

const SCHOOL_A = 'school-a';
const TEACHER_1 = 'teacher-1';

const teacher: CurrentUser = {
  sub: TEACHER_1,
  userId: TEACHER_1,
  role: UserRole.TEACHER,
  schoolId: SCHOOL_A,
  mustChangePassword: false,
};

const admin: CurrentUser = { ...teacher, sub: 'admin-1', userId: 'admin-1', role: UserRole.ADMIN };

/** Captures the `where` clause the service builds, which is what confines it. */
function serviceCapturing(captured: { where?: Prisma.UserWhereInput }) {
  const prisma = {
    user: {
      findMany: async (args: { where: Prisma.UserWhereInput }) => {
        captured.where = args.where;
        return [];
      },
      findFirst: async (args: { where: Prisma.UserWhereInput }) => {
        captured.where = args.where;
        return null;
      },
      create: async () => ({}),
      update: async () => ({}),
    },
  } as unknown as PrismaService;

  return new StudentsService(
    prisma,
    { hash: async (p: string) => `hashed:${p}` } as unknown as PasswordService,
    { revokeAllForUser: vi.fn() } as unknown as TokenService,
    { record: vi.fn() } as unknown as AuditService,
  );
}

describe('StudentsService scoping', () => {
  let captured: { where?: Prisma.UserWhereInput };
  let service: StudentsService;

  beforeEach(() => {
    captured = {};
    service = serviceCapturing(captured);
  });

  it('only ever looks at students', async () => {
    await service.list(teacher);

    expect(captured.where?.role).toBe(UserRole.STUDENT);
  });

  // The school comes from the verified token, so one school's data cannot be
  // reached from another (SRS 38).
  it('confines the query to the school in the token', async () => {
    await service.list(teacher);

    expect(captured.where?.schoolId).toBe(SCHOOL_A);
  });

  // A teacher sees her own students, not the whole school (SRS 35).
  it('confines a teacher to her own students', async () => {
    await service.list(teacher);

    expect(captured.where?.studentProfile).toEqual({ assignedTeacherId: TEACHER_1 });
  });

  it('lets an admin see the whole school, but still only that school', async () => {
    await service.list(admin);

    expect(captured.where?.studentProfile).toBeUndefined();
    expect(captured.where?.schoolId).toBe(SCHOOL_A);
  });

  it('hides deleted students from the roster by default', async () => {
    await service.list(teacher);

    expect(captured.where?.deletedAt).toBeNull();
  });

  it('includes deleted students only when asked, so they can be restored', async () => {
    await service.list(teacher, true);

    expect(captured.where?.deletedAt).toBeUndefined();
  });

  // Fetching one student applies the same confinement as the list, so a known
  // id belonging to another teacher is not a way around it.
  it('applies the same scope when fetching one student by id', async () => {
    await service.get(teacher, 'some-id').catch(() => undefined);

    expect(captured.where?.schoolId).toBe(SCHOOL_A);
    expect(captured.where?.studentProfile).toEqual({ assignedTeacherId: TEACHER_1 });
  });

  /**
   * 404 rather than 403: saying "forbidden" would confirm the student exists,
   * which already leaks something about another teacher's roster.
   */
  it('reports a student outside the scope as not found', async () => {
    await expect(service.get(teacher, 'someone-elses-student')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['update', () => service.update(teacher, 'x', { fullName: 'New' })],
    ['disable', () => service.setStatus(teacher, 'x', UserStatus.DISABLED)],
    ['delete', () => service.softDelete(teacher, 'x')],
    ['restore', () => service.restore(teacher, 'x')],
    ['reset password', () => service.resetPassword(teacher, 'x')],
  ])('refuses to %s a student outside the scope', async (_label, run) => {
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudentsService.create', () => {
  it('refuses a duplicate username within the same school', async () => {
    const prisma = {
      user: {
        findFirst: async () => ({ id: 'existing' }),
        create: async () => ({}),
      },
    } as unknown as PrismaService;

    const service = new StudentsService(
      prisma,
      { hash: async () => 'h' } as unknown as PasswordService,
      {} as unknown as TokenService,
      { record: vi.fn() } as unknown as AuditService,
    );

    await expect(
      service.create(teacher, { fullName: 'A', username: 'taken', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks a teacher-set password as temporary (SRS 28.6.2)', async () => {
    let createdData: { mustChangePassword?: boolean } = {};

    const prisma = {
      user: {
        findFirst: async () => null,
        create: async (args: { data: { mustChangePassword?: boolean } }) => {
          createdData = args.data;
          return { ...args.data, id: 'new', studentProfile: { fullName: 'A' }, createdAt: new Date() };
        },
      },
    } as unknown as PrismaService;

    const service = new StudentsService(
      prisma,
      { hash: async () => 'h' } as unknown as PasswordService,
      {} as unknown as TokenService,
      { record: vi.fn() } as unknown as AuditService,
    );

    await service.create(teacher, { fullName: 'A', username: 'new', password: 'password123' });

    expect(createdData.mustChangePassword).toBe(true);
  });
});
