import { randomInt } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';
import { CreateSchoolDto } from './dto/school.dto';
import {
  CreatedSchool,
  PlatformOverview,
  PlatformTotals,
  SchoolDetail,
  SchoolNeed,
  SchoolOverview,
} from './admin.types';

/** Characters that cannot be confused when read aloud or copied by hand. */
const UNAMBIGUOUS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** PostgreSQL's code for a name already taken. */
const UNIQUE_VIOLATION = '23505';

/** What the two database functions return, in their own column names. */
interface TotalsRow {
  schools: bigint;
  schools_active: bigint;
  schools_disabled: bigint;
  teachers: bigint;
  students: bigint;
  school_admins: bigint;
  platform_admins: bigint;
}

interface SchoolRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  created_at: Date;
  teachers: bigint;
  students: bigint;
  school_admins: bigint;
  courses: bigint;
}

/** `count(*)` comes back as a bigint, which does not survive JSON. */
const count = (value: bigint): number => Number(value);

/**
 * The platform, as its operator sees it.
 *
 * Everything here comes through two database functions — `platform_totals`
 * and `platform_school_overview` — which are the whole of the platform-level
 * read surface. They are the same kind of narrow, explicit route around the
 * row-level policies that authentication already uses: each answers one
 * question, in aggregate, and neither can return a person's row.
 *
 * No read here goes through `prisma.forSchool`. That is the tenant path, and a
 * platform operator has no tenant; looping it over every school to fake
 * platform sight would be both an N+1 and a way of pretending to be each
 * school in turn, which is exactly what the boundary exists to avoid.
 *
 * The one place a school's scope is opened is the audit entry, which
 * `AuditService` writes into the log of the school it is about — one row, in
 * the school it belongs to, for an action the operator has already taken.
 * That is a write of her own record, not a way of reading anything.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The rule that makes this service safe to have at all.
   *
   * Checked here as well as by the guard, because this is the one service in
   * the API whose queries are not confined to a school. A caller who is not
   * the platform operator, or who is somehow a platform operator *and* a
   * member of a school, gets nothing. The database holds the second half of
   * that rule too — see `users_platform_admin_has_no_school`.
   */
  private assertPlatformOperator(actor: CurrentUser): void {
    if (actor.role !== UserRole.PLATFORM_ADMIN || actor.schoolId !== null) {
      throw new ForbiddenException('This is not available to your account.');
    }
  }

  async overview(actor: CurrentUser): Promise<PlatformOverview> {
    this.assertPlatformOperator(actor);

    const [totals, schools] = await Promise.all([
      this.prisma.$queryRaw<TotalsRow[]>`SELECT * FROM platform_totals()`,
      this.prisma.$queryRaw<SchoolRow[]>`SELECT * FROM platform_school_overview()`,
    ]);

    return {
      totals: this.readTotals(totals[0]),
      schools: schools.map((row) => this.readSchool(row)),
    };
  }

  private readTotals(row: TotalsRow | undefined): PlatformTotals {
    // An empty platform is a real state, not a failure: nothing has been set
    // up yet. Zeroes are the honest answer.
    if (!row) {
      return {
        schools: 0,
        schoolsActive: 0,
        schoolsDisabled: 0,
        teachers: 0,
        students: 0,
        schoolAdmins: 0,
        platformAdmins: 0,
      };
    }

    return {
      schools: count(row.schools),
      schoolsActive: count(row.schools_active),
      schoolsDisabled: count(row.schools_disabled),
      teachers: count(row.teachers),
      students: count(row.students),
      schoolAdmins: count(row.school_admins),
      platformAdmins: count(row.platform_admins),
    };
  }

  private readSchool(row: SchoolRow): SchoolOverview {
    const teachers = count(row.teachers);
    const students = count(row.students);
    const courses = count(row.courses);

    // Each of these is read straight off the counts. Nothing is inferred
    // about how a school is doing, and nothing is predicted.
    const needs: SchoolNeed[] = [];
    if (row.status === 'DISABLED') needs.push('marked_disabled');
    if (teachers === 0) needs.push('no_teacher');
    if (students === 0) needs.push('no_students');
    if (courses === 0) needs.push('no_course');

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      teachers,
      students,
      schoolAdmins: count(row.school_admins),
      courses,
      needs,
    };
  }

  // --- One school -----------------------------------------------------------

  async school(actor: CurrentUser, schoolId: string): Promise<SchoolDetail> {
    this.assertPlatformOperator(actor);
    return this.readDetail(await this.mustFindSchool(schoolId));
  }

  /**
   * Creates a school and the person who will run it, together.
   *
   * One database function does both inserts in one statement, so there is no
   * such thing as a half-made school: if the administrator cannot be created
   * the school is not created either. A school nobody can get into would be
   * worse than a failure the operator can see and retry.
   *
   * The password is generated here rather than chosen. The operator is
   * setting up somebody else's account, and letting her pick that person's
   * first password invites a weak one shared across every school she opens.
   * It is returned exactly once and stored only as a hash.
   */
  async createSchool(actor: CurrentUser, dto: CreateSchoolDto): Promise<CreatedSchool> {
    this.assertPlatformOperator(actor);

    const name = dto.name.trim();
    const temporaryPassword = this.generatePassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    let created: { school_id: string; admin_id: string };

    try {
      const rows = await this.prisma.$queryRaw<{ school_id: string; admin_id: string }[]>`
        SELECT * FROM platform_create_school(
          ${name}, ${dto.adminUsername}, ${dto.adminEmail},
          ${passwordHash}, ${dto.adminDisplayName}
        )
      `;
      created = rows[0];
    } catch (caught) {
      // The function raises unique_violation for a name already in use. Said
      // as a sentence about the name, because that is the field she can fix.
      if (this.isDuplicate(caught)) {
        throw new ConflictException('A school with that name already exists.');
      }
      throw caught;
    }

    await this.audit.record({
      action: AUDIT_ACTIONS.SCHOOL_CREATED,
      schoolId: created.school_id,
      actorUserId: actor.userId,
      targetType: 'school',
      targetId: created.school_id,
      metadata: { adminUserId: created.admin_id },
    });

    return {
      school: this.readDetail(await this.mustFindSchool(created.school_id)),
      firstAdmin: {
        username: dto.adminUsername,
        email: dto.adminEmail,
        displayName: dto.adminDisplayName,
        temporaryPassword,
      },
    };
  }

  /** The only field of a school the platform owns. */
  async renameSchool(actor: CurrentUser, schoolId: string, name: string): Promise<SchoolDetail> {
    this.assertPlatformOperator(actor);
    await this.mustFindSchool(schoolId);

    try {
      await this.prisma.$queryRaw`SELECT platform_rename_school(${schoolId}::uuid, ${name.trim()})`;
    } catch (caught) {
      if (this.isDuplicate(caught)) {
        throw new ConflictException('A school with that name already exists.');
      }
      throw caught;
    }

    await this.audit.record({
      action: AUDIT_ACTIONS.SCHOOL_UPDATED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'school',
      targetId: schoolId,
      metadata: { fields: ['name'] },
    });

    return this.readDetail(await this.mustFindSchool(schoolId));
  }

  /**
   * Opens or closes a school.
   *
   * Closing it now means something. `school_is_active` is consulted when
   * anybody signs in, whenever a session is renewed, and whenever a screen
   * asks who it is talking to — so the people in a closed school stop being
   * able to work rather than merely being labelled closed.
   *
   * Closing it also ends every session inside the school, in the same
   * statement as the status change. What that does not do is reach inside an
   * access token already issued: those are signed rather than looked up, and
   * stay valid until they expire. The exact window is measured and reported
   * rather than papered over.
   */
  async setSchoolStatus(
    actor: CurrentUser,
    schoolId: string,
    status: UserStatus,
  ): Promise<SchoolDetail> {
    this.assertPlatformOperator(actor);
    await this.mustFindSchool(schoolId);

    await this.prisma.$queryRaw`
      SELECT platform_set_school_status(${schoolId}::uuid, ${status}::"user_status")
    `;

    await this.audit.record({
      action:
        status === UserStatus.DISABLED
          ? AUDIT_ACTIONS.SCHOOL_DISABLED
          : AUDIT_ACTIONS.SCHOOL_ENABLED,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'school',
      targetId: schoolId,
    });

    return this.readDetail(await this.mustFindSchool(schoolId));
  }

  // --- Shared -------------------------------------------------------------

  private async mustFindSchool(schoolId: string): Promise<SchoolRow> {
    const rows = await this.prisma.$queryRaw<SchoolRow[]>`
      SELECT * FROM platform_school_detail(${schoolId}::uuid)
    `;

    if (rows.length === 0) throw new NotFoundException('School not found.');

    return rows[0];
  }

  private readDetail(row: SchoolRow): SchoolDetail {
    return {
      ...this.readSchool(row),
      // Said as its own field rather than left to be inferred from the
      // status, so the screen never has to guess what the status does.
      signInAllowed: row.status === 'ACTIVE',
    };
  }

  /** Readable, unambiguous, and long enough to be worth typing once. */
  private generatePassword(): string {
    let password = '';
    for (let index = 0; index < 14; index += 1) {
      password += UNAMBIGUOUS[randomInt(UNAMBIGUOUS.length)];
    }
    return password;
  }

  /**
   * A name already in use, as PostgreSQL says it.
   *
   * Matched on the SQLSTATE rather than on the wording: the functions raise
   * `unique_violation` with a sentence of their own, and Prisma replaces that
   * sentence with its own before this ever sees it. 23505 survives.
   */
  private isDuplicate(caught: unknown): boolean {
    return (
      caught instanceof Prisma.PrismaClientKnownRequestError &&
      (caught.meta as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
    );
  }
}
