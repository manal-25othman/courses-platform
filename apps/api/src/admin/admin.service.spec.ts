import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { PasswordService } from '../auth/password.service';
import type { AuditService } from '../audit/audit.service';

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
function serviceWith(
  rows: { totals?: unknown[]; schools?: unknown[]; detail?: unknown[] } = {},
) {
  const asked: string[] = [];
  const hashed: string[] = [];
  const audited: { action: string }[] = [];

  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      asked.push(sql.trim());

      if (sql.includes('platform_totals')) return rows.totals ?? [totalsRow];
      if (sql.includes('platform_create_school')) {
        return [{ school_id: 'school-1', admin_id: 'admin-1' }];
      }
      if (sql.includes('platform_school_detail')) return rows.detail ?? [schoolRow];
      if (sql.includes('platform_rename_school')) return [];
      if (sql.includes('platform_set_school_status')) return [];
      return rows.schools ?? [schoolRow];
    },
    forSchool: vi.fn(),
  } as unknown as PrismaService;

  const service = new AdminService(
    prisma,
    {
      hash: async (password: string) => {
        hashed.push(password);
        return `hashed:${password}`;
      },
    } as unknown as PasswordService,
    { record: async (entry: { action: string }) => void audited.push(entry) } as unknown as AuditService,
  );

  return { service, asked, prisma, hashed, audited };
}

/** The four fields the operator fills in to open a school. */
const newSchool = {
  name: 'A New School',
  adminDisplayName: 'A Person',
  adminUsername: 'a.person',
  adminEmail: 'a@example.com',
};

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
   * Every school route, not just the one that reads. A route added to this
   * service later without the check would be a way for a school administrator
   * to open, rename or close any school on the platform.
   */
  it.each([
    ['reading one school', (service: AdminService, who: CurrentUser) => service.school(who, 'school-1')],
    ['creating a school', (service: AdminService, who: CurrentUser) => service.createSchool(who, newSchool)],
    ['renaming a school', (service: AdminService, who: CurrentUser) => service.renameSchool(who, 'school-1', 'Other')],
    [
      'closing a school',
      (service: AdminService, who: CurrentUser) =>
        service.setSchoolStatus(who, 'school-1', UserStatus.DISABLED),
    ],
  ])('refuses a school administrator %s', async (_what, call) => {
    const { service } = serviceWith();
    const schoolAdmin = { ...operator, role: UserRole.ADMIN, schoolId: 'school-1' };

    await expect(call(service, schoolAdmin as CurrentUser)).rejects.toThrow(ForbiddenException);
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


/**
 * Opening a school.
 *
 * The password is the one plaintext credential this API ever hands back, so
 * what happens to it is worth pinning down: generated here, hashed before it
 * reaches the database, returned once, and never stored in a readable form.
 */
describe('AdminService school creation', () => {
  it('generates the first password rather than letting anyone choose it', async () => {
    const { service, hashed } = serviceWith();

    const created = await service.createSchool(operator, newSchool);

    expect(created.firstAdmin.temporaryPassword).toHaveLength(14);
    expect(hashed, 'the password reached the database unhashed').toEqual([
      created.firstAdmin.temporaryPassword,
    ]);
  });

  /**
   * Read aloud, written on a slip of paper, or typed from a phone screen: a
   * password with an l and a 1 in it costs somebody a support call.
   */
  it('uses only characters that cannot be confused for one another', async () => {
    const { service } = serviceWith();

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const created = await service.createSchool(operator, newSchool);
      expect(created.firstAdmin.temporaryPassword).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
    }
  });

  it('gives two schools two different passwords', async () => {
    const { service } = serviceWith();

    const first = await service.createSchool(operator, newSchool);
    const second = await service.createSchool(operator, newSchool);

    expect(first.firstAdmin.temporaryPassword).not.toEqual(second.firstAdmin.temporaryPassword);
  });

  it('creates the school and the administrator in one statement', async () => {
    const { service, asked } = serviceWith();

    await service.createSchool(operator, newSchool);

    // One call, not three writes that could half-succeed.
    expect(asked.filter((sql) => sql.includes('platform_create_school'))).toHaveLength(1);
    expect(asked.some((sql) => sql.includes('INSERT'))).toBe(false);
  });

  it('records that a school was opened', async () => {
    const { service, audited } = serviceWith();

    await service.createSchool(operator, newSchool);

    expect(audited.map((entry) => entry.action)).toContain('school.created');
  });
});

describe('AdminService school status', () => {
  it('says outright whether people can sign in, rather than leaving it to be inferred', async () => {
    const open = serviceWith({ detail: [schoolRow] });
    const closed = serviceWith({ detail: [{ ...schoolRow, status: 'DISABLED' as const }] });

    expect((await open.service.school(operator, 'school-1')).signInAllowed).toBe(true);
    expect((await closed.service.school(operator, 'school-1')).signInAllowed).toBe(false);
  });

  it.each([
    [UserStatus.DISABLED, 'school.disabled'],
    [UserStatus.ACTIVE, 'school.enabled'],
  ])('records %s as %s', async (status, action) => {
    const { service, audited } = serviceWith();

    await service.setSchoolStatus(operator, 'school-1', status);

    expect(audited.map((entry) => entry.action)).toContain(action);
  });

  /** A school that is not there is not a 500, and not a blank page. */
  it('reports a school that does not exist as not found', async () => {
    const { service } = serviceWith({ detail: [] });

    await expect(service.school(operator, 'nope')).rejects.toThrow(NotFoundException);
  });
});
