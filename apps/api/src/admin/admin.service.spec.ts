import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';

const operator: CurrentUser = {
  sub: 'op-1',
  userId: 'op-1',
  role: UserRole.PLATFORM_ADMIN,
  schoolId: null,
  mustChangePassword: false,
};

const totalsRow = {
  schools: 2n,
  schools_active: 1n,
  schools_disabled: 1n,
  teachers: 3n,
  students: 9n,
  school_admins: 1n,
  platform_admins: 1n,
};

const schoolRow = {
  id: 'school-1',
  name: 'A School',
  status: 'ACTIVE' as const,
  created_at: new Date('2026-01-02T03:04:05Z'),
  teachers: 1n,
  students: 4n,
  school_admins: 0n,
  courses: 1n,
};

/** Captures the SQL the service asks for, which is the point of the boundary. */
function serviceWith(rows: { totals?: unknown[]; schools?: unknown[] } = {}) {
  const asked: string[] = [];
  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      asked.push(sql.trim());
      return sql.includes('platform_totals') ? (rows.totals ?? [totalsRow]) : (rows.schools ?? [schoolRow]);
    },
    forSchool: vi.fn(),
  } as unknown as PrismaService;

  return { service: new AdminService(prisma), asked, prisma };
}

describe('AdminService authorization', () => {
  it.each([
    ['a teacher', { role: UserRole.TEACHER, schoolId: 'school-1' }],
    ['a school administrator', { role: UserRole.ADMIN, schoolId: 'school-1' }],
    ['a student', { role: UserRole.STUDENT, schoolId: 'school-1' }],
  ])('refuses %s', async (_who, who) => {
    const { service } = serviceWith();

    await expect(service.overview({ ...operator, ...who } as CurrentUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  /**
   * The one combination the whole design exists to prevent: platform sight
   * held by somebody who is also inside a school. The database refuses to
   * store it; this refuses to serve it even if a token somehow carried it.
   */
  it('refuses a platform admin that carries a school', async () => {
    const { service } = serviceWith();

    await expect(
      service.overview({ ...operator, schoolId: 'school-1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows the platform operator', async () => {
    const { service } = serviceWith();

    await expect(service.overview(operator)).resolves.toBeDefined();
  });

  /**
   * The tenant path is `forSchool`, and a platform read must not go through
   * it — looping it over every school would both be an N+1 and amount to
   * impersonating each school in turn.
   */
  it('never opens a tenant scope', async () => {
    const { service, prisma } = serviceWith();

    await service.overview(operator);

    expect(prisma.forSchool).not.toHaveBeenCalled();
  });

  it('reads only the two aggregate functions', async () => {
    const { service, asked } = serviceWith();

    await service.overview(operator);

    expect(asked).toEqual([
      'SELECT * FROM platform_totals()',
      'SELECT * FROM platform_school_overview()',
    ]);
  });
});

describe('AdminService reporting', () => {
  it('turns the database counts into numbers a browser can read', async () => {
    const { service } = serviceWith();

    const result = await service.overview(operator);

    expect(result.totals).toEqual({
      schools: 2,
      schoolsActive: 1,
      schoolsDisabled: 1,
      teachers: 3,
      students: 9,
      schoolAdmins: 1,
      platformAdmins: 1,
    });
  });

  it('reports an empty platform as zeroes rather than failing', async () => {
    const { service } = serviceWith({ totals: [], schools: [] });

    const result = await service.overview(operator);

    expect(result.totals.schools).toBe(0);
    expect(result.schools).toEqual([]);
  });

  it.each([
    ['nothing missing', { teachers: 1n, students: 4n, courses: 1n }, []],
    ['no teacher', { teachers: 0n, students: 4n, courses: 1n }, ['no_teacher']],
    ['no students', { teachers: 1n, students: 0n, courses: 1n }, ['no_students']],
    ['no course', { teachers: 1n, students: 4n, courses: 0n }, ['no_course']],
    [
      'a bare school',
      { teachers: 0n, students: 0n, courses: 0n },
      ['no_teacher', 'no_students', 'no_course'],
    ],
  ])('reads "%s" straight off the counts', async (_name, counts, expected) => {
    const { service } = serviceWith({ schools: [{ ...schoolRow, ...counts }] });

    const result = await service.overview(operator);

    expect(result.schools[0].needs).toEqual(expected);
  });

  it('reports a disabled school as marked, alongside whatever else it lacks', async () => {
    const { service } = serviceWith({
      schools: [{ ...schoolRow, status: 'DISABLED' as const, students: 0n }],
    });

    const result = await service.overview(operator);

    expect(result.schools[0].needs).toEqual(['marked_disabled', 'no_students']);
  });

  /**
   * Nothing about a person may cross this boundary. Asserted on the whole
   * serialised answer rather than field by field, so a column added to the
   * function later is caught here rather than noticed in a browser.
   */
  it('carries nothing personal', async () => {
    const { service } = serviceWith();

    const serialised = JSON.stringify(await service.overview(operator));

    for (const forbidden of [
      'passwordHash',
      'password_hash',
      'username',
      'email',
      'token',
      'tokenHash',
      'lastLoginAt',
      'fullName',
      'body',
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
