import { UserStatus } from '@prisma/client';

/**
 * One teacher, as the school administrator sees her.
 *
 * No password hash, no token, no reset data — the same rule the student views
 * follow. `students` is how many children are assigned to her, which is the
 * fact an administrator acts on when she is deciding who to hire, who to move
 * work away from, and who cannot be removed yet.
 */
export interface TeacherView {
  id: string;
  displayName: string;
  username: string;
  email: string | null;
  title: string | null;
  status: UserStatus;
  isDeleted: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  students: number;
}

/** A teacher who has just been made, with the way in. Shown once. */
export interface CreatedTeacher {
  teacher: TeacherView;
  temporaryPassword: string;
}

/** A student, named only as far as an assignment decision needs. */
export interface AssignableStudent {
  id: string;
  fullName: string;
  username: string;
  assignedTeacherId: string | null;
}

/**
 * The school, for the person who runs it.
 *
 * Counts and the two gaps an administrator can actually close: a teacher
 * nobody has given students to, and a student nobody is responsible for.
 */
export interface SchoolOverview {
  schoolName: string;
  teachers: number;
  teachersSignedIn: number;
  students: number;
  studentsUnassigned: number;
  teachersWithoutStudents: number;
}
