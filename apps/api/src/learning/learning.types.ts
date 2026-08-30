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

export interface UnitProgress {
  unitId: string;
  vocabulary: ComponentProgress;
  grammar: ComponentProgress;
  activity: ComponentProgress;
  /** Her best activity score so far, or null if she has not finished one. */
  bestScorePercent: number | null;
  attemptsTaken: number;
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
