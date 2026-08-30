/**
 * The contract every question kind implements.
 *
 * Adding a kind means writing one of these and registering it. Nothing else in
 * the system changes: attempts, scoring and the screens all work through this
 * interface (SRS 10, 44).
 */

/** A repeatable shuffle. The same seed always gives the same order. */
export interface Rng {
  next(): number;
}

/**
 * Deterministic pseudo-random numbers.
 *
 * Attempts store their seed, so a student who closes the page and comes back
 * sees the questions in the same order she left them (SRS 11 with SRS 23).
 */
export function createRng(seed: string): Rng {
  // xmur3 to turn the seed text into a number, then mulberry32 to step it on.
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  let a = h >>> 0;

  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Fisher–Yates, driven by the seeded generator so the result is repeatable. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/** What the student is shown. Never contains the answer. */
export interface PresentedQuestion {
  id: string;
  typeKey: string;
  prompt: string;
  /** Everything needed to display the question, with answers removed. */
  payload: Record<string, unknown>;
  points: number;
}

export interface GradeResult {
  isCorrect: boolean;
  /** Whole or partial credit, never more than the question's points. */
  pointsAwarded: number;
  /** Shown when reviewing an answer. Never returned before submission. */
  expected?: unknown;
  /** Set when a question cannot be marked automatically. */
  needsManualMarking?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

export interface QuestionHandler {
  readonly key: string;

  /** Checks a question is well formed before it is saved. */
  validate(payload: unknown, answerKey: unknown): ValidationResult;

  /**
   * Builds what the student sees, applying shuffling if asked.
   *
   * Must never include anything from the answer key.
   */
  present(
    question: { id: string; prompt: string; payload: unknown; points: number },
    options: { shuffleOptions: boolean; rng: Rng },
  ): PresentedQuestion;

  /** Marks a response. */
  grade(
    payload: unknown,
    answerKey: unknown,
    response: unknown,
    points: number,
  ): GradeResult;
}
