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

/**
 * Captures the `where` clause the service builds, and the school it opened the
 * transaction with. Both matter: the school is the database-enforced barrier,
 * the where clause is the application one.
 */
function serviceCapturing(captured: { where?: Prisma.UserWhereInput; school?: string }) {
  const tx = {
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
  };

  const prisma = {
    // Every read and write goes through here, which is what pins the query to
    // one school inside the database.
    forSchool: async <T>(schoolId: string, work: (t: typeof tx) => Promise<T>) => {
      captured.school = schoolId;
      return work(tx);
    },
    user: tx.user,
  } as unknown as PrismaService;

  return new StudentsService(
    prisma,
    { hash: async (p: string) => `hashed:${p}` } as unknown as PasswordService,
    { revokeAllForUser: vi.fn() } as unknown as TokenService,
    { record: vi.fn() } as unknown as AuditService,
  );
}

describe('StudentsService scoping', () => {
  let captured: { where?: Prisma.UserWhereInput; school?: string };
  let service: StudentsService;

  beforeEach(() => {
    captured = {};
    service = serviceCapturing(captured);
  });

  // The school comes from the verified token and is what the database policy
  // matches on, so a query can only ever touch one school's rows.
  it('opens the transaction with the school from the token', async () => {
    await service.list(teacher);

    expect(captured.school).toBe(SCHOOL_A);
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
    const tx = { user: { findFirst: async () => ({ id: 'existing' }), create: async () => ({}) } };
    const prisma = {
      forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
      user: tx.user,
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

    const tx = {
      user: {
        findFirst: async () => null,
        create: async (args: { data: { mustChangePassword?: boolean } }) => {
          createdData = args.data;
          return { ...args.data, id: 'new', studentProfile: { fullName: 'A' }, createdAt: new Date() };
        },
      },
    };
    const prisma = {
      forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
      user: tx.user,
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

/**
 * The account actions a teacher takes, and what each one does to the account
 * and to any session the student already has.
 *
 * These pin the behaviour the Students screen describes to her in words. If
 * one of them changes, the wording on that screen becomes a lie, which is a
 * worse failure than a broken button.
 */
describe('StudentsService account actions', () => {
  const STUDENT = 'student-9';

  /** A service whose one student exists, capturing what is written. */
  function serviceFor(row: Record<string, unknown>) {
    const written: { data?: Record<string, unknown> } = {};
    const revokeAllForUser = vi.fn();
    const student = {
      id: STUDENT,
      schoolId: SCHOOL_A,
      username: 'sara',
      email: null,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date(),
      studentProfile: { fullName: 'Sara' },
      ...row,
    };

    const tx = {
      user: {
        findFirst: async () => student,
        findUnique: async () => student,
        update: async (args: { data: Record<string, unknown> }) => {
          written.data = args.data;
          return { ...student, ...args.data };
        },
        create: async () => student,
      },
    };

    const prisma = {
      forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
      user: tx.user,
    } as unknown as PrismaService;

    const service = new StudentsService(
      prisma,
      { hash: async (p: string) => `hashed:${p}` } as unknown as PasswordService,
      { revokeAllForUser } as unknown as TokenService,
      { record: vi.fn() } as unknown as AuditService,
    );

    return { service, written, revokeAllForUser };
  }

  it('ends the sessions a student already has when her account is turned off', async () => {
    const { service, written, revokeAllForUser } = serviceFor({});

    await service.setStatus(teacher, STUDENT, UserStatus.DISABLED);

    expect(written.data).toEqual({ status: UserStatus.DISABLED });
    expect(revokeAllForUser).toHaveBeenCalledWith(STUDENT);
  });

  it('does not revoke anything when an account is turned back on', async () => {
    const { service, revokeAllForUser } = serviceFor({ status: UserStatus.DISABLED });

    await service.setStatus(teacher, STUDENT, UserStatus.ACTIVE);

    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  /**
   * "Remove" keeps everything. The screen promises a teacher that her
   * progress, answers and messages survive, and the only thing written here
   * is a timestamp saying when she was hidden.
   */
  it('removes a student by marking her hidden, erasing nothing', async () => {
    const { service, written, revokeAllForUser } = serviceFor({});

    const view = await service.softDelete(teacher, STUDENT);

    expect(Object.keys(written.data ?? {})).toEqual(['deletedAt']);
    expect(written.data?.deletedAt).toBeInstanceOf(Date);
    expect(view.isDeleted).toBe(true);
    expect(revokeAllForUser).toHaveBeenCalledWith(STUDENT);
  });

  it('puts a removed student back by clearing the same timestamp', async () => {
    const { service, written } = serviceFor({ deletedAt: new Date() });

    const view = await service.restore(teacher, STUDENT);

    expect(written.data).toEqual({ deletedAt: null });
    expect(view.isDeleted).toBe(false);
  });

  it('hands back a new password once and requires her to replace it', async () => {
    const { service, written, revokeAllForUser } = serviceFor({});

    const result = await service.resetPassword(teacher, STUDENT);

    expect(result.temporaryPassword).toMatch(/^[a-z2-9]{10}$/);
    expect(written.data?.mustChangePassword).toBe(true);
    expect(written.data?.passwordHash).toBe(`hashed:${result.temporaryPassword}`);
    // The stored form must never travel back with it.
    expect(JSON.stringify(result.student)).not.toContain('hashed:');
    expect(revokeAllForUser).toHaveBeenCalledWith(STUDENT);
  });

  it('never returns the stored password in a student view', async () => {
    const { service } = serviceFor({});

    const view = await service.get(teacher, STUDENT);

    expect(Object.keys(view)).not.toContain('passwordHash');
  });

  /**
   * An address may be shared. Siblings using one parent's mailbox is the
   * ordinary case here, and recovery is built to mail every account behind an
   * address rather than assume one. A uniqueness check added later would
   * quietly break that, so it is asserted absent on purpose.
   */
  it('lets two students share one email address', async () => {
    const { service, written } = serviceFor({});

    await service.update(teacher, STUDENT, { email: 'family@example.invalid' });

    expect(written.data?.email).toBe('family@example.invalid');
  });

  it('clears the address when an empty one is sent', async () => {
    const { service, written } = serviceFor({ email: 'old@example.invalid' });

    await service.update(teacher, STUDENT, { email: '' });

    expect(written.data?.email).toBeNull();
  });

  it('leaves a username alone when it has not changed', async () => {
    const { service, written } = serviceFor({});

    await service.update(teacher, STUDENT, { username: 'sara' });

    expect(written.data?.username).toBe('sara');
  });
});
