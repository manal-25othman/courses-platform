/**
 * What the platform operator is shown.
 *
 * Aggregates and school-level facts. There is deliberately no shape here that
 * could carry a person's name, username, address, password, token, message or
 * progress: the questions this dashboard asks are about the platform, and the
 * answers stop at the school.
 */

/** How big the platform is. */
export interface PlatformTotals {
  schools: number;
  schoolsActive: number;
  schoolsDisabled: number;
  teachers: number;
  students: number;
  /** School-level administrators, counted apart from the platform's own. */
  schoolAdmins: number;
  platformAdmins: number;
}

/** One school, as the platform sees it. */
export interface SchoolOverview {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  teachers: number;
  students: number;
  schoolAdmins: number;
  courses: number;
  /**
   * Operational states this school is in, each decided by the counts above
   * and nothing else. No prediction, no scoring, no judgement of a school.
   */
  needs: SchoolNeed[];
}

/** Something about a school that a platform operator may want to act on. */
export type SchoolNeed = 'no_teacher' | 'no_students' | 'no_course' | 'marked_disabled';

export interface PlatformOverview {
  totals: PlatformTotals;
  schools: SchoolOverview[];
}
