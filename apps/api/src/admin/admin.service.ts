import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/auth.types';
import {
  PlatformOverview,
  PlatformTotals,
  SchoolNeed,
  SchoolOverview,
} from './admin.types';

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
 * This service deliberately does NOT use `prisma.forSchool`. That is the
 * tenant path, and a platform operator has no tenant; looping it over every
 * school to fake platform sight would be both an N+1 and a way of pretending
 * to be each school in turn, which is exactly what the boundary exists to
 * avoid.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
}
