import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService, TenantClient } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import { AssignableStudent, CreatedTeacher, SchoolOverview, TeacherView } from './school.types';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

/** Characters that cannot be confused when read aloud or copied by hand. */
const UNAMBIGUOUS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** The row shape every read here assembles a teacher from. */
type TeacherRow = {
  id: string;
  username: string;
  email: string | null;
  status: UserStatus;
  deletedAt: Date | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  teacherProfile: { displayName: string; title: string | null } | null;
};

/**
 * The school administrator's own work: the teachers in her school.
 *
 * Everything here runs through `prisma.forSchool` with the school taken from
 * her verified token, which is the same tenant path the teacher's own screens
 * use. There is no privileged function and no widened grant, because none is
 * needed: an administrator managing her own school is an ordinary tenant
 * write, and the row-level policies already say what "her own school" means.
 *
 * That is the difference between this service and `AdminService`. The platform
 * operator has no school and needs a deliberate route around the policies;
 * the school administrator has exactly one school and belongs inside them.
 */
@Injectable()
export class SchoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The rule that confines every query in this service.
   *
   * A school administrator, and nobody else. A teacher reaching these would be
   * able to manage her colleagues; a platform operator reaching them would be
   * claiming a tenant she does not belong to, which is the one thing the
   * platform boundary exists to prevent. The guard says the same thing, and
   * this says it again where the queries are.
   */
  private schoolOf(actor: CurrentUser): string {
    if (actor.role !== UserRole.ADMIN || !actor.schoolId) {
      throw new ForbiddenException('This is not available to your account.');
    }

    return actor.schoolId;
  }

  /**
   * The same check, for anything that writes.
   *
   * A closed school refuses sign-ins and renewals, but an access token issued
   * before it closed keeps verifying until it expires — that window is
   * measured and documented. Reading a stale page through it is one thing;
   * creating an account inside a school the platform has shut is another,
   * because the credential outlives the token that made it. So every write
   * here asks whether the school is still open, and a closed one is refused
   * the same way an expired session is.
   */
  private async openSchoolOf(actor: CurrentUser): Promise<string> {
    const schoolId = this.schoolOf(actor);

    if (!(await this.prisma.schoolIsActive(schoolId))) {
      throw new ForbiddenException('This school is closed.');
    }

    return schoolId;
  }

  // --- The school ----------------------------------------------------------

  /**
   * What the administrator's home is built from.
   *
   * Five counts in four queries, none of which grows with the number of
   * teachers: the assignment figures come from one grouped count rather than
   * from asking about each teacher in turn.
   */
  async overview(actor: CurrentUser): Promise<SchoolOverview> {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const [school, teachers, students, assignments] = await Promise.all([
        tx.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
        tx.user.findMany({
          where: { schoolId, role: UserRole.TEACHER, deletedAt: null },
          select: { id: true, lastLoginAt: true },
        }),
        tx.user.count({ where: { schoolId, role: UserRole.STUDENT, deletedAt: null } }),
        tx.studentProfile.groupBy({
          by: ['assignedTeacherId'],
          where: { user: { schoolId, role: UserRole.STUDENT, deletedAt: null } },
          _count: { _all: true },
        }),
      ]);

      const withStudents = new Set(
        assignments
          .filter((row) => row.assignedTeacherId !== null)
          .map((row) => row.assignedTeacherId as string),
      );

      return {
        schoolName: school?.name ?? '',
        teachers: teachers.length,
        teachersSignedIn: teachers.filter((teacher) => teacher.lastLoginAt !== null).length,
        students,
        studentsUnassigned:
          assignments.find((row) => row.assignedTeacherId === null)?._count._all ?? 0,
        teachersWithoutStudents: teachers.filter((teacher) => !withStudents.has(teacher.id)).length,
      };
    });
  }

  // --- Teachers ------------------------------------------------------------

  /**
   * The staff list.
   *
   * Removed teachers are hidden unless asked for, the same way removed
   * students are: removal is meant to take somebody out of the everyday list
   * while keeping everything she made.
   *
   * The student counts are one grouped query for the whole list, not one per
   * teacher. A school with thirty teachers costs the same two queries as a
   * school with one.
   */
  async listTeachers(actor: CurrentUser, includeRemoved = false): Promise<TeacherView[]> {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const teachers = await tx.user.findMany({
        where: {
          schoolId,
          role: UserRole.TEACHER,
          ...(includeRemoved ? {} : { deletedAt: null }),
        },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
        orderBy: [{ deletedAt: 'asc' }, { createdAt: 'asc' }],
      });

      const counts = await this.studentCounts(tx, schoolId);

      return teachers.map((teacher) => this.toView(teacher, counts.get(teacher.id) ?? 0));
    });
  }

  async getTeacher(actor: CurrentUser, teacherId: string): Promise<TeacherView> {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const teacher = await this.findInSchool(tx, schoolId, teacherId);
      const counts = await this.studentCounts(tx, schoolId);

      return this.toView(teacher, counts.get(teacher.id) ?? 0);
    });
  }

  /**
   * Adds a teacher, and hands over the way in.
   *
   * The password is generated rather than chosen, shown once, and stored only
   * as a hash — and the teacher must replace it when she first signs in, so
   * the administrator's copy stops working as soon as it has been used.
   */
  async createTeacher(actor: CurrentUser, dto: CreateTeacherDto): Promise<CreatedTeacher> {
    const schoolId = await this.openSchoolOf(actor);
    const temporaryPassword = this.generatePassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    const created = await this.prisma.forSchool(schoolId, async (tx) => {
      await this.assertUsernameFree(tx, schoolId, dto.username);

      return tx.user.create({
        data: {
          schoolId,
          role: UserRole.TEACHER,
          username: dto.username,
          email: dto.email,
          passwordHash,
          mustChangePassword: true,
          teacherProfile: {
            create: { displayName: dto.displayName, title: dto.title ?? null },
          },
        },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.TEACHER_CREATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'teacher',
      targetId: created.id,
    });

    // Nobody is assigned to her yet, which is a fact rather than a lookup.
    return { teacher: this.toView(created, 0), temporaryPassword };
  }

  async updateTeacher(
    actor: CurrentUser,
    teacherId: string,
    dto: UpdateTeacherDto,
  ): Promise<TeacherView> {
    const schoolId = await this.openSchoolOf(actor);

    const updated = await this.prisma.forSchool(schoolId, async (tx) => {
      const teacher = await this.findInSchool(tx, schoolId, teacherId);

      if (dto.username && dto.username !== teacher.username) {
        await this.assertUsernameFree(tx, schoolId, dto.username, teacher.id);
      }

      const profile =
        dto.displayName !== undefined || dto.title !== undefined
          ? {
              ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
              // An empty title clears it; a teacher may have none.
              ...(dto.title !== undefined ? { title: dto.title || null } : {}),
            }
          : null;

      return tx.user.update({
        where: { id: teacher.id },
        data: {
          ...(dto.username ? { username: dto.username } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(profile ? { teacherProfile: { update: profile } } : {}),
        },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.TEACHER_UPDATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'teacher',
      targetId: teacherId,
      metadata: { fields: Object.keys(dto) },
    });

    return this.withCount(actor, updated);
  }

  /** Blocks sign-in, and ends the sessions she already has. */
  async setTeacherStatus(
    actor: CurrentUser,
    teacherId: string,
    status: UserStatus,
  ): Promise<TeacherView> {
    const schoolId = await this.openSchoolOf(actor);

    const updated = await this.prisma.forSchool(schoolId, async (tx) => {
      const teacher = await this.findInSchool(tx, schoolId, teacherId);

      return tx.user.update({
        where: { id: teacher.id },
        data: { status },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
      });
    });

    if (status === UserStatus.DISABLED) {
      await this.tokens.revokeAllForUser(teacherId);
    }

    await this.audit.record({
      action:
        status === UserStatus.DISABLED
          ? AUDIT_ACTIONS.TEACHER_DISABLED
          : AUDIT_ACTIONS.TEACHER_ENABLED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'teacher',
      targetId: teacherId,
    });

    return this.withCount(actor, updated);
  }

  /**
   * Takes a teacher out of the everyday list, keeping everything she made.
   *
   * Refused while children are still assigned to her. A removed teacher is
   * nobody's teacher, and a student pointing at one would be a child whose
   * work has no owner and who appears on no teacher's roster — visible only
   * to an administrator who thinks to look. Moving her students first is a
   * decision somebody has to make, so it is asked for rather than guessed.
   */
  async removeTeacher(actor: CurrentUser, teacherId: string): Promise<TeacherView> {
    const schoolId = await this.openSchoolOf(actor);

    const updated = await this.prisma.forSchool(schoolId, async (tx) => {
      const teacher = await this.findInSchool(tx, schoolId, teacherId);
      const counts = await this.studentCounts(tx, schoolId);
      const assigned = counts.get(teacher.id) ?? 0;

      if (assigned > 0) {
        throw new ConflictException(
          `${assigned} ${assigned === 1 ? 'student is' : 'students are'} still assigned to her. ` +
            'Move them to another teacher first.',
        );
      }

      return tx.user.update({
        where: { id: teacher.id },
        data: { deletedAt: new Date() },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
      });
    });

    await this.tokens.revokeAllForUser(teacherId);

    await this.audit.record({
      action: AUDIT_ACTIONS.TEACHER_DELETED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'teacher',
      targetId: teacherId,
    });

    return this.withCount(actor, updated);
  }

  async restoreTeacher(actor: CurrentUser, teacherId: string): Promise<TeacherView> {
    const schoolId = await this.openSchoolOf(actor);

    const updated = await this.prisma.forSchool(schoolId, async (tx) => {
      const teacher = await this.findInSchool(tx, schoolId, teacherId);

      return tx.user.update({
        where: { id: teacher.id },
        data: { deletedAt: null },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.TEACHER_RESTORED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'teacher',
      targetId: teacherId,
    });

    return this.withCount(actor, updated);
  }

  /**
   * A new temporary password for a teacher who cannot get in.
   *
   * The same pattern a teacher uses for a student: generated, returned once,
   * kept only as a hash, replaced by the teacher at her next sign-in, and every
   * session opened with the old password ended.
   */
  async resetTeacherPassword(
    actor: CurrentUser,
    teacherId: string,
  ): Promise<{ teacher: TeacherView; temporaryPassword: string }> {
    const schoolId = await this.openSchoolOf(actor);
    const temporaryPassword = this.generatePassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    const updated = await this.prisma.forSchool(schoolId, async (tx) => {
      const teacher = await this.findInSchool(tx, schoolId, teacherId);

      return tx.user.update({
        where: { id: teacher.id },
        data: { passwordHash, mustChangePassword: true },
        include: { teacherProfile: { select: { displayName: true, title: true } } },
      });
    });

    await this.tokens.revokeAllForUser(teacherId);

    await this.audit.record({
      action: AUDIT_ACTIONS.TEACHER_PASSWORD_RESET,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'teacher',
      targetId: teacherId,
    });

    return { teacher: await this.withCount(actor, updated), temporaryPassword };
  }

  // --- Who teaches whom ----------------------------------------------------

  /**
   * The school's students, with who is responsible for each.
   *
   * Names and usernames only: enough to pick the right child, nothing about
   * how she is getting on. An administrator deciding who teaches whom does not
   * need to read anybody's marks to do it.
   */
  async students(actor: CurrentUser): Promise<AssignableStudent[]> {
    const schoolId = this.schoolOf(actor);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const students = await tx.user.findMany({
        where: { schoolId, role: UserRole.STUDENT, deletedAt: null },
        select: {
          id: true,
          username: true,
          studentProfile: { select: { fullName: true, assignedTeacherId: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      return students.map((student) => ({
        id: student.id,
        fullName: student.studentProfile?.fullName ?? student.username,
        username: student.username,
        assignedTeacherId: student.studentProfile?.assignedTeacherId ?? null,
      }));
    });
  }

  /**
   * Puts a student in a teacher's care, or takes her out of it.
   *
   * Both ends are looked up inside the administrator's own school before
   * anything is written, so a teacher's id from another school names nothing
   * here — and says nothing back, because a teacher who is not hers and a
   * teacher who does not exist give the same answer.
   */
  async assignStudent(
    actor: CurrentUser,
    studentId: string,
    teacherId: string | null,
  ): Promise<AssignableStudent> {
    const schoolId = await this.openSchoolOf(actor);

    const assigned = await this.prisma.forSchool(schoolId, async (tx) => {
      const student = await tx.user.findFirst({
        where: { id: studentId, schoolId, role: UserRole.STUDENT, deletedAt: null },
        select: { id: true, username: true, studentProfile: { select: { fullName: true } } },
      });

      if (!student) throw new NotFoundException('Student not found.');
      if (!student.studentProfile) {
        throw new BadRequestException('That account has no student record to assign.');
      }

      if (teacherId !== null) {
        // The check that keeps assignment inside one school. A teacher outside
        // it is invisible here, so this refuses before anything is written.
        const teacher = await tx.user.findFirst({
          where: {
            id: teacherId,
            schoolId,
            role: UserRole.TEACHER,
            deletedAt: null,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        });

        if (!teacher) throw new NotFoundException('Teacher not found.');
      }

      const profile = await tx.studentProfile.update({
        where: { userId: student.id },
        data: { assignedTeacherId: teacherId },
        select: { fullName: true, assignedTeacherId: true },
      });

      return {
        id: student.id,
        fullName: profile.fullName,
        username: student.username,
        assignedTeacherId: profile.assignedTeacherId,
      };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.STUDENT_ASSIGNED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: studentId,
      metadata: { assignedTeacherId: teacherId },
    });

    return assigned;
  }

  // --- Shared --------------------------------------------------------------

  /**
   * One teacher in this school, or nothing.
   *
   * 404 rather than 403, for the same reason the student lookup gives one:
   * saying "forbidden" about a teacher in another school would confirm she
   * exists. Not yours and not there read alike.
   */
  private async findInSchool(
    tx: TenantClient,
    schoolId: string,
    teacherId: string,
  ): Promise<TeacherRow> {
    const teacher = await tx.user.findFirst({
      where: { id: teacherId, schoolId, role: UserRole.TEACHER },
      include: { teacherProfile: { select: { displayName: true, title: true } } },
    });

    if (!teacher) throw new NotFoundException('Teacher not found.');

    return teacher;
  }

  /**
   * How many students each teacher has, for the whole school at once.
   *
   * One grouped count, so a list of teachers costs one query rather than one
   * per teacher.
   */
  private async studentCounts(
    tx: TenantClient,
    schoolId: string,
  ): Promise<Map<string, number>> {
    const rows = await tx.studentProfile.groupBy({
      by: ['assignedTeacherId'],
      where: { user: { schoolId, role: UserRole.STUDENT, deletedAt: null } },
      _count: { _all: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.assignedTeacherId) counts.set(row.assignedTeacherId, row._count._all);
    }

    return counts;
  }

  /** Re-reads the count after a write, so the answer is never stale. */
  private async withCount(actor: CurrentUser, teacher: TeacherRow): Promise<TeacherView> {
    const schoolId = this.schoolOf(actor);
    const counts = await this.prisma.forSchool(schoolId, (tx) =>
      this.studentCounts(tx, schoolId),
    );

    return this.toView(teacher, counts.get(teacher.id) ?? 0);
  }

  private toView(teacher: TeacherRow, students: number): TeacherView {
    return {
      id: teacher.id,
      // Her name lives on her profile. Falling back to the username keeps a
      // row readable if a profile is ever missing, rather than showing blank.
      displayName: teacher.teacherProfile?.displayName ?? teacher.username,
      username: teacher.username,
      email: teacher.email,
      title: teacher.teacherProfile?.title ?? null,
      status: teacher.status,
      isDeleted: teacher.deletedAt !== null,
      mustChangePassword: teacher.mustChangePassword,
      lastLoginAt: teacher.lastLoginAt?.toISOString() ?? null,
      createdAt: teacher.createdAt.toISOString(),
      students,
    };
  }

  /**
   * The rule the database actually holds: a username is unique within its
   * school, so two schools may each have a "sara". Checked here across every
   * role, because a teacher and a student cannot share one either.
   */
  private async assertUsernameFree(
    tx: TenantClient,
    schoolId: string,
    username: string,
    exceptUserId?: string,
  ): Promise<void> {
    const clash = await tx.user.findFirst({
      where: { schoolId, username, ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}) },
    });

    if (clash) {
      throw new ConflictException('That username is already taken in this school.');
    }
  }

  /** Readable, unambiguous, and long enough to be worth typing once. */
  private generatePassword(): string {
    let password = '';

    for (let index = 0; index < 12; index += 1) {
      password += UNAMBIGUOUS[randomInt(UNAMBIGUOUS.length)];
    }

    return password;
  }
}
