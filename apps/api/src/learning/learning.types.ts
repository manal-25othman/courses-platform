import { ContentStatus } from '@prisma/client';

/**
 * A question frozen at the moment it was put to a student.
 *
 * Marking reads from this and never from the live question, so a teacher
 * correcting a question later changes what the next student sees and leaves
 * every attempt already taken exactly as it was (SRS 47).
 */
export interface QuestionSnapshot {
  questionId: string;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  answerKey: Record<string, unknown>;
  points: number;
  /**
   * Pictures that were part of the question, frozen with it.
   *
   * A question can be "what is this?" over a photograph, where the picture is
   * half the question. Replacing it later would change what an old attempt
   * asked, so the addresses are copied in here like everything else.
   */
  media?: { id: string; url: string; altText: string | null }[];
  /** When the snapshot was taken, for a teacher looking at an old result. */
  capturedAt: string;
}

/** How far a student has got with one component of a unit. */
export interface ComponentProgress {
  /** How many things there are to do. Zero when the unit has none of this. */
  total: number;
  /** How many she has finished. */
  done: number;
  /** 0–100. A component with nothing in it counts as complete. */
  percent: number;
}

/** How an assessment stands for one student. */
export interface AssessmentState {
  /** How many questions the unit's assessment holds. Zero means there is none. */
  questionCount: number;
  /** The mark she has to reach, from the settings store. */
  passMarkPercent: number;
  /** How many tries she is allowed, or null for no limit. */
  maxAttempts: number | null;
  attemptsUsed: number;
  attemptsLeft: number | null;
  /** The counting result, by the configured policy. Null before her first try. */
  bestScorePercent: number | null;
  /** True once a try has reached the mark. */
  passed: boolean;
  /** Whether she may start one now, and if not, why not. */
  canStart: boolean;
  blockedBecause: 'no_questions' | 'no_attempts_left' | 'already_passed' | null;
}

export interface UnitProgress {
  unitId: string;
  vocabulary: ComponentProgress;
  grammar: ComponentProgress;
  activity: ComponentProgress;
  assessment: ComponentProgress;
  /** Her best activity score so far, or null if she has not finished one. */
  bestScorePercent: number | null;
  attemptsTaken: number;
  /** The unit's assessment, as it stands for her. */
  assessmentState: AssessmentState;
  /**
   * Whether finishing this unit counts towards the course.
   *
   * Welcome and Grammar Review do not (client, 2026-08-31). Her progress is
   * still calculated and shown — she can see how she is doing — it simply does
   * not count towards the four themed units or the course.
   */
  countsTowardCompletion: boolean;
  /**
   * The weighted total, using `progress.weights` from the settings store.
   * Components the platform has not built yet are named in `notCounted` rather
   * than quietly counted as zero or as complete.
   */
  overallPercent: number;
  notCounted: string[];
  isComplete: boolean;
}

export const PUBLISHED_ONLY = { status: ContentStatus.PUBLISHED } as const;
