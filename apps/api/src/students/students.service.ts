import { randomInt } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService, TenantClient } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

/** What the teacher sees about one student. Never includes the password hash. */
export interface StudentView {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  status: UserStatus;
  isDeleted: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Characters that cannot be confused when read aloud or copied by hand. */
const UNAMBIGUOUS = 'abcdefghjkmnpqrstuvwxyz23456789';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The rule that confines every query in this service.
   *
   * A teacher sees her own students only (SRS 35); an admin sees the whole
   * school. The school always comes from the verified token, never from the
   * request, so a caller cannot reach another school's data by asking
   * (SRS 37, 38).
   */
  private scopeFor(actor: CurrentUser): Prisma.UserWhereInput {
    const scope: Prisma.UserWhereInput = {
      role: UserRole.STUDENT,
      schoolId: actor.schoolId,
    };

    if (actor.role === UserRole.TEACHER) {
      scope.studentProfile = { assignedTeacherId: actor.userId };
    }

    return scope;
  }

  private toView(user: {
    id: string;
    username: string;
    email: string | null;
    status: UserStatus;
    deletedAt: Date | null;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    studentProfile: { fullName: string } | null;
  }): StudentView {
    return {
      id: user.id,
      fullName: user.studentProfile?.fullName ?? user.username,
      username: user.username,
      email: user.email,
      status: user.status,
      isDeleted: user.deletedAt !== null,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * The roster.
   *
   * Deleted students are hidden by default, because deletion is meant to remove
   * them from normal lists (SRS 27.1). `includeDeleted` reveals them so the
   * teacher can restore one.
   */
  async list(actor: CurrentUser, includeDeleted = false): Promise<StudentView[]> {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const students = await tx.user.findMany({
        where: {
          ...this.scopeFor(actor),
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
        include: { studentProfile: true },
        orderBy: [{ deletedAt: 'asc' }, { createdAt: 'asc' }],
      });

      return students.map((student) => this.toView(student));
    });
  }

  /**
   * The school every query in this service runs under.
   *
   * Taken from the verified token. An account with no school cannot reach
   * school data at all, which is the safe direction.
   */
  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /** Loads one student, or refuses if she is not this actor's to see. */
  private async findInScope(tx: TenantClient, actor: CurrentUser, studentId: string) {
    const student = await tx.user.findFirst({
      where: { id: studentId, ...this.scopeFor(actor) },
      include: { studentProfile: true },
    });

    if (!student) {
      // 404 rather than 403: confirming the record exists would already leak
      // something about another teacher's or another school's students.
      throw new NotFoundException('Student not found.');
    }

    return student;
  }

  async get(actor: CurrentUser, studentId: string): Promise<StudentView> {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) =>
      this.toView(await this.findInScope(tx, actor, studentId)),
    );
  }

  async create(actor: CurrentUser, dto: CreateStudentDto): Promise<StudentView> {
    const schoolId = this.schoolOf(actor);
    const passwordHash = await this.passwords.hash(dto.password);

    const created = await this.prisma.forSchool(schoolId, async (tx) => {
      await this.assertUsernameFree(tx, schoolId, dto.username);

      const teacherId =
        actor.role === UserRole.TEACHER ? actor.userId : await this.firstTeacherOf(tx, schoolId);

      return tx.user.create({
        data: {
          schoolId,
          role: UserRole.STUDENT,
          username: dto.username,
          email: dto.email ?? null,
          passwordHash,
          // A password the teacher chose is temporary; the student sets her own
          // when she first signs in (SRS 28.6.2).
          mustChangePassword: true,
          studentProfile: {
            create: { fullName: dto.fullName, assignedTeacherId: teacherId },
          },
        },
        include: { studentProfile: true },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: created.id,
    });

    return this.toView(created);
  }

  async update(actor: CurrentUser, studentId: string, dto: UpdateStudentDto): Promise<StudentView> {
    const schoolId = this.schoolOf(actor);

    const { student, updated } = await this.prisma.forSchool(schoolId, async (tx) => {
      const student = await this.findInScope(tx, actor, studentId);

      if (dto.username && dto.username !== student.username) {
        await this.assertUsernameFree(tx, student.schoolId, dto.username, student.id);
      }

      const updated = await tx.user.update({
        where: { id: student.id },
        data: {
          ...(dto.username ? { username: dto.username } : {}),
          // An empty string clears the address, since email is optional.
          ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          ...(dto.fullName ? { studentProfile: { update: { fullName: dto.fullName } } } : {}),
        },
        include: { studentProfile: true },
      });

      return { student, updated };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      schoolId: student.schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: student.id,
      metadata: { fields: Object.keys(dto) },
    });

    return this.toView(updated);
  }

  /** Blocks sign-in but keeps her visible in the roster (SRS 27.1). */
  async setStatus(
    actor: CurrentUser,
    studentId: string,
    status: UserStatus,
  ): Promise<StudentView> {
    const { student, updated } = await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const student = await this.findInScope(tx, actor, studentId);

      const updated = await tx.user.update({
        where: { id: student.id },
        data: { status },
        include: { studentProfile: true },
      });

      return { student, updated };
    });

    if (status === UserStatus.DISABLED) {
      // Blocking sign-in has to end sessions she already has, or she stays in
      // until her current token expires.
      await this.tokens.revokeAllForUser(student.id);
    }

    await this.audit.record({
      action:
        status === UserStatus.DISABLED
          ? AUDIT_ACTIONS.STUDENT_DISABLED
          : AUDIT_ACTIONS.STUDENT_ENABLED,
      schoolId: student.schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: student.id,
    });

    return this.toView(updated);
  }

  /**
   * Hides her and blocks sign-in, keeping every result, answer and message.
   * Reversible by restore (SRS 27.1). Nothing is erased.
   */
  async softDelete(actor: CurrentUser, studentId: string): Promise<StudentView> {
    const { student, updated } = await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const student = await this.findInScope(tx, actor, studentId);

      const updated = await tx.user.update({
        where: { id: student.id },
        data: { deletedAt: new Date() },
        include: { studentProfile: true },
      });

      return { student, updated };
    });

    await this.tokens.revokeAllForUser(student.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.STUDENT_DELETED,
      schoolId: student.schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: student.id,
    });

    return this.toView(updated);
  }

  async restore(actor: CurrentUser, studentId: string): Promise<StudentView> {
    const { student, updated } = await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const student = await this.findInScope(tx, actor, studentId);

      const updated = await tx.user.update({
        where: { id: student.id },
        data: { deletedAt: null },
        include: { studentProfile: true },
      });

      return { student, updated };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.STUDENT_RESTORED,
      schoolId: student.schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: student.id,
    });

    return this.toView(updated);
  }

  /**
   * Gives the student a new temporary password (SRS 28.2).
   *
   * Returned once, to be handed to the student. It is not stored in readable
   * form anywhere, and she must replace it at her next sign-in.
   */
  async resetPassword(
    actor: CurrentUser,
    studentId: string,
  ): Promise<{ student: StudentView; temporaryPassword: string }> {
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    const { student, updated } = await this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const student = await this.findInScope(tx, actor, studentId);

      const updated = await tx.user.update({
        where: { id: student.id },
        data: { passwordHash, mustChangePassword: true },
        include: { studentProfile: true },
      });

      return { student, updated };
    });

    // Any session opened with the old password must end.
    await this.tokens.revokeAllForUser(student.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.STUDENT_PASSWORD_RESET,
      schoolId: student.schoolId,
      actorUserId: actor.userId,
      targetType: 'student',
      targetId: student.id,
    });

    return { student: this.toView(updated), temporaryPassword };
  }

  /** Readable, unambiguous, and long enough to be worth typing once. */
  private generateTemporaryPassword(): string {
    let password = '';

    for (let index = 0; index < 10; index += 1) {
      password += UNAMBIGUOUS[randomInt(UNAMBIGUOUS.length)];
    }

    return password;
  }

  private async assertUsernameFree(
    tx: TenantClient,
    schoolId: string | null,
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

  private async firstTeacherOf(tx: TenantClient, schoolId: string): Promise<string | null> {
    const teacher = await tx.user.findFirst({
      where: { schoolId, role: UserRole.TEACHER, deletedAt: null },
    });

    return teacher?.id ?? null;
  }
}
