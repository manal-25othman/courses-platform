import { describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { SchoolService } from './school.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { PasswordService } from '../auth/password.service';
import type { TokenService } from '../auth/token.service';
import type { AuditService } from '../audit/audit.service';

const SCHOOL = 'school-1';

const head: CurrentUser = {
  sub: 'head-1',
  userId: 'head-1',
  role: UserRole.ADMIN,
  schoolId: SCHOOL,
  mustChangePassword: false,
};

const teacherRow = {
  id: 'teacher-1',
  schoolId: SCHOOL,
  username: 'noura',
  email: 'noura@example.test',
  status: UserStatus.ACTIVE,
  deletedAt: null,
  mustChangePassword: false,
  lastLoginAt: new Date('2026-09-01T08:00:00Z'),
  createdAt: new Date('2026-08-01T08:00:00Z'),
  passwordHash: '$argon2id$never-leaves-the-database',
  teacherProfile: { displayName: 'Noura Al-Harbi', title: 'Ms' },
};

/**
 * A service over a recorded fake database.
 *
 * `captured` is what the tests assert on: the school every query ran under,
 * the data written, and how many times each table was asked — which is how the
 * "one query for the whole list" claim is checked rather than assumed.
 */
function serviceWith(
  options: {
    teachers?: unknown[];
    clash?: boolean;
    assignedCounts?: { assignedTeacherId: string | null; _count: { _all: number } }[];
    schoolOpen?: boolean;
    teacherFound?: boolean;
    studentFound?: boolean;
  } = {},
) {
  const captured: {
    schools: string[];
    written: Record<string, unknown>[];
    groupBys: number;
    audited: string[];
    revoked: string[];
    hashed: string[];
  } = { schools: [], written: [], groupBys: 0, audited: [], revoked: [], hashed: [] };

  const tx = {
    school: { findUnique: async () => ({ name: 'A School' }) },
    user: {
      findMany: async () => options.teachers ?? [teacherRow],
      count: async () => 4,
      findFirst: async (args: { where: Record<string, unknown> }) => {
        // Stands in for three different lookups, told apart by what they ask.
        if (args.where.role === UserRole.STUDENT) {
          return options.studentFound === false
            ? null
            : { id: 'student-1', username: 'sara', studentProfile: { fullName: 'Sara' } };
        }
        if (args.where.role === UserRole.TEACHER && args.where.status) {
          return options.teacherFound === false ? null : { id: 'teacher-1' };
        }
        if (args.where.role === UserRole.TEACHER) return teacherRow;
        // The username check.
        return options.clash ? { id: 'someone-else' } : null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        captured.written.push(args.data);
        return { ...teacherRow, ...args.data, teacherProfile: teacherRow.teacherProfile };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.written.push(args.data);
        return { ...teacherRow, ...args.data };
      },
    },
    studentProfile: {
      groupBy: async () => {
        captured.groupBys += 1;
        return options.assignedCounts ?? [{ assignedTeacherId: 'teacher-1', _count: { _all: 3 } }];
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.written.push(args.data);
        return { fullName: 'Sara', assignedTeacherId: args.data.assignedTeacherId };
      },
    },
  };

  const prisma = {
    forSchool: async <T>(schoolId: string, work: (t: typeof tx) => Promise<T>) => {
      captured.schools.push(schoolId);
      return work(tx);
    },
    schoolIsActive: async () => options.schoolOpen ?? true,
  } as unknown as PrismaService;

  const service = new SchoolService(
    prisma,
    {
      hash: async (password: string) => {
        captured.hashed.push(password);
        return `hashed:${password}`;
      },
    } as unknown as PasswordService,
    {
      revokeAllForUser: async (id: string) => void captured.revoked.push(id),
    } as unknown as TokenService,
    {
      record: async (entry: { action: string }) => void captured.audited.push(entry.action),
    } as unknown as AuditService,
  );

  return { service, captured };
}

const newTeacher = {
  displayName: 'Hind Al-Qahtani',
  username: 'hind',
  email: 'hind@example.test',
};

/** Every route on the service, so a new one cannot skip the role check. */
const everyCall: [string, (service: SchoolService, who: CurrentUser) => Promise<unknown>][] = [
  ['the overview', (service, who) => service.overview(who)],
  ['the teacher list', (service, who) => service.listTeachers(who)],
  ['one teacher', (service, who) => service.getTeacher(who, 'teacher-1')],
  ['adding a teacher', (service, who) => service.createTeacher(who, newTeacher)],
  ['editing a teacher', (service, who) => service.updateTeacher(who, 'teacher-1', { title: 'Ms' })],
  [
    'disabling a teacher',
    (service, who) => service.setTeacherStatus(who, 'teacher-1', UserStatus.DISABLED),
  ],
  ['removing a teacher', (service, who) => service.removeTeacher(who, 'teacher-1')],
  ['restoring a teacher', (service, who) => service.restoreTeacher(who, 'teacher-1')],
  ['resetting a password', (service, who) => service.resetTeacherPassword(who, 'teacher-1')],
  ['the student list', (service, who) => service.students(who)],
  ['assigning a student', (service, who) => service.assignStudent(who, 'student-1', null)],
];

describe('SchoolService authorization', () => {
  /**
   * The three roles that must not reach any of this, and why each matters.
   *
   * A teacher would be able to manage her colleagues' accounts, including
   * resetting their passwords. A student would be able to manage the staff.
   * And a platform operator reaching it would be claiming a tenant she does
   * not belong to — the single thing the platform boundary exists to prevent.
   */
  describe.each([
    ['a teacher', { role: UserRole.TEACHER, schoolId: SCHOOL }],
    ['a student', { role: UserRole.STUDENT, schoolId: SCHOOL }],
    ['the platform operator', { role: UserRole.PLATFORM_ADMIN, schoolId: null }],
  ])('refuses %s', (_who, who) => {
    it.each(everyCall)('%s', async (_what, call) => {
      const { service, captured } = serviceWith();

      await expect(call(service, { ...head, ...who } as CurrentUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(captured.schools, 'a refused caller still opened a school scope').toEqual([]);
    });
  });

  /** An administrator whose token somehow carries no school gets nothing. */
  it('refuses an administrator with no school', async () => {
    const { service } = serviceWith();

    await expect(service.listTeachers({ ...head, schoolId: null })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('runs every query under the school from her token', async () => {
    const { service, captured } = serviceWith();

    await service.listTeachers(head);
    await service.overview(head);

    expect(new Set(captured.schools)).toEqual(new Set([SCHOOL]));
  });
});

describe('SchoolService teachers', () => {
  it('never returns a password hash or anything else private', async () => {
    const { service } = serviceWith();

    const serialised = JSON.stringify(await service.listTeachers(head));

    for (const forbidden of ['passwordHash', 'password_hash', 'argon2', 'tokenHash', 'deletedAt']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  /**
   * The claim that the list does not cost one query per teacher. Asserted on
   * the number of grouped counts, which is what a per-teacher implementation
   * would multiply.
   */
  it('counts every teacher’s students in one query, whatever the size of the school', async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      ...teacherRow,
      id: `teacher-${index}`,
      username: `teacher${index}`,
    }));
    const { service, captured } = serviceWith({ teachers: many });

    const listed = await service.listTeachers(head);

    expect(listed).toHaveLength(30);
    expect(captured.groupBys, 'the student counts were fetched per teacher').toBe(1);
  });

  it('generates the first password rather than letting anyone choose it', async () => {
    const { service, captured } = serviceWith();

    const created = await service.createTeacher(head, newTeacher);

    expect(created.temporaryPassword).toHaveLength(12);
    expect(created.temporaryPassword).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
    expect(captured.hashed, 'the password reached the database unhashed').toEqual([
      created.temporaryPassword,
    ]);
    expect(captured.written[0]).toMatchObject({
      role: UserRole.TEACHER,
      mustChangePassword: true,
      passwordHash: `hashed:${created.temporaryPassword}`,
    });
  });

  it('gives two teachers two different passwords', async () => {
    const { service } = serviceWith();

    const first = await service.createTeacher(head, newTeacher);
    const second = await service.createTeacher(head, newTeacher);

    expect(first.temporaryPassword).not.toEqual(second.temporaryPassword);
  });

  /** The rule the database holds: unique within a school, not across them. */
  it('refuses a username already used in this school', async () => {
    const { service } = serviceWith({ clash: true });

    await expect(service.createTeacher(head, newTeacher)).rejects.toThrow(ConflictException);
  });

  it('ends her sessions when her account is turned off', async () => {
    const { service, captured } = serviceWith();

    await service.setTeacherStatus(head, 'teacher-1', UserStatus.DISABLED);

    expect(captured.revoked).toContain('teacher-1');
    expect(captured.audited).toContain('teacher.disabled');
  });

  it('leaves her sessions alone when her account is turned back on', async () => {
    const { service, captured } = serviceWith();

    await service.setTeacherStatus(head, 'teacher-1', UserStatus.ACTIVE);

    expect(captured.revoked).toEqual([]);
    expect(captured.audited).toContain('teacher.enabled');
  });

  /**
   * A removed teacher is nobody's teacher. Removing one who still has children
   * assigned would leave them on no roster at all, so it is refused rather
   * than quietly reassigning somebody else's class.
   */
  it('refuses to remove a teacher who still has students', async () => {
    const { service, captured } = serviceWith();

    await expect(service.removeTeacher(head, 'teacher-1')).rejects.toThrow(ConflictException);
    expect(captured.written, 'a refused removal wrote something anyway').toEqual([]);
  });

  it('removes a teacher once her students have been moved', async () => {
    const { service, captured } = serviceWith({ assignedCounts: [] });

    await service.removeTeacher(head, 'teacher-1');

    expect(captured.written[0]).toHaveProperty('deletedAt');
    expect(captured.revoked).toContain('teacher-1');
    expect(captured.audited).toContain('teacher.deleted');
  });

  it('resets a password to a fresh generated one, and ends her sessions', async () => {
    const { service, captured } = serviceWith();

    const result = await service.resetTeacherPassword(head, 'teacher-1');

    expect(result.temporaryPassword).toHaveLength(12);
    expect(captured.written[0]).toMatchObject({ mustChangePassword: true });
    expect(captured.revoked).toContain('teacher-1');
    expect(JSON.stringify(result.teacher)).not.toContain(result.temporaryPassword);
  });

  /**
   * A teacher in another school must read as absent, not as refused: a 403
   * would confirm she exists, which is the leak the 404 is there to avoid.
   */
  it('reports a student who is not in this school as not found', async () => {
    const { service } = serviceWith({ studentFound: false });

    await expect(service.assignStudent(head, 'student-elsewhere', null)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.assignStudent(head, 'student-elsewhere', null)).rejects.toThrow(
      'Student not found.',
    );
  });
});

describe('SchoolService student assignment', () => {
  it('checks the teacher belongs to this school before writing anything', async () => {
    const { service, captured } = serviceWith({ teacherFound: false });

    await expect(service.assignStudent(head, 'student-1', 'teacher-elsewhere')).rejects.toThrow(
      NotFoundException,
    );
    expect(captured.written, 'a cross-school assignment was written').toEqual([]);
  });

  it('says nothing about whether a teacher elsewhere exists', async () => {
    const { service } = serviceWith({ teacherFound: false });

    await expect(
      service.assignStudent(head, 'student-1', 'teacher-elsewhere'),
    ).rejects.toThrow('Teacher not found.');
  });

  it('assigns a student to a teacher in her own school', async () => {
    const { service, captured } = serviceWith();

    const result = await service.assignStudent(head, 'student-1', 'teacher-1');

    expect(result.assignedTeacherId).toBe('teacher-1');
    expect(captured.audited).toContain('student.assigned');
  });

  /** Nobody is a real answer: a student can arrive before it is settled. */
  it('lets a student be left with no teacher', async () => {
    const { service } = serviceWith();

    const result = await service.assignStudent(head, 'student-1', null);

    expect(result.assignedTeacherId).toBeNull();
  });
});

/**
 * A school the platform has closed.
 *
 * Sign-in and renewal already refuse, but an access token issued before the
 * school closed keeps verifying until it expires. Reading a stale page through
 * that window is the documented behaviour; creating an account through it is
 * not, because the credential outlives the token. So writes check, and reads
 * are left as they were.
 */
describe('SchoolService in a closed school', () => {
  const writes = everyCall.filter(([what]) =>
    ['adding', 'editing', 'disabling', 'removing', 'restoring', 'resetting', 'assigning'].some(
      (verb) => what.startsWith(verb),
    ),
  );

  it('covers every write', () => {
    expect(writes).toHaveLength(7);
  });

  it.each(writes)('refuses %s', async (_what, call) => {
    const { service, captured } = serviceWith({ schoolOpen: false, assignedCounts: [] });

    await expect(call(service, head)).rejects.toThrow(ForbiddenException);
    expect(captured.written, 'a closed school was written to anyway').toEqual([]);
  });

  it.each([
    ['the overview', (service: SchoolService) => service.overview(head)],
    ['the teacher list', (service: SchoolService) => service.listTeachers(head)],
    ['the student list', (service: SchoolService) => service.students(head)],
  ])('still answers %s, as it did before', async (_what, call) => {
    const { service } = serviceWith({ schoolOpen: false });

    await expect(call(service)).resolves.toBeDefined();
  });
});

describe('SchoolService overview', () => {
  it('reports the gaps an administrator can close', async () => {
    const { service } = serviceWith({
      teachers: [
        { ...teacherRow, id: 'teacher-1', lastLoginAt: new Date() },
        { ...teacherRow, id: 'teacher-2', lastLoginAt: null },
      ],
      assignedCounts: [
        { assignedTeacherId: 'teacher-1', _count: { _all: 3 } },
        { assignedTeacherId: null, _count: { _all: 2 } },
      ],
    });

    const overview = await service.overview(head);

    expect(overview).toMatchObject({
      teachers: 2,
      teachersSignedIn: 1,
      studentsUnassigned: 2,
      // Only teacher-2 has nobody.
      teachersWithoutStudents: 1,
    });
  });

  it('carries nothing about any individual person', async () => {
    const { service } = serviceWith();

    const serialised = JSON.stringify(await service.overview(head));

    for (const forbidden of ['username', 'email', 'fullName', 'passwordHash', 'lastLoginAt']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
