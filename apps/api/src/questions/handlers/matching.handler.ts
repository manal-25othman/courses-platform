import {
  GradeResult,
  PresentedQuestion,
  QuestionHandler,
  Rng,
  ValidationResult,
  shuffle,
} from '../question.types';

interface MatchingPayload {
  left: { id: string; text: string }[];
  right: { id: string; text: string }[];
}

interface MatchingAnswer {
  /** left id -> right id */
  pairs: Record<string, string>;
}

/**
 * Match each item on the left to one on the right.
 *
 * Both columns are shuffled independently, so the pairs never line up in the
 * order they were written (client decision, SRS 55).
 *
 * Marked per pair rather than all-or-nothing: a student who gets four of six
 * right is credited for four.
 */
export class MatchingHandler implements QuestionHandler {
  readonly key = 'matching';

  validate(payload: unknown, answerKey: unknown): ValidationResult {
    const problems: string[] = [];
    const p = payload as MatchingPayload | null;
    const a = answerKey as MatchingAnswer | null;

    if (!p?.left?.length || !p?.right?.length) {
      problems.push('Both columns need at least one item.');
    }

    if (!a?.pairs || Object.keys(a.pairs).length === 0) {
      problems.push('No pairs are recorded.');
    } else if (p?.left && p?.right) {
      const leftIds = new Set(p.left.map((i) => i.id));
      const rightIds = new Set(p.right.map((i) => i.id));

      for (const [l, r] of Object.entries(a.pairs)) {
        if (!leftIds.has(l)) problems.push(`Pair refers to a missing left item "${l}".`);
        if (!rightIds.has(r)) problems.push(`Pair refers to a missing right item "${r}".`);
      }

      if (Object.keys(a.pairs).length !== p.left.length) {
        problems.push('Every item on the left needs a pair.');
      }
    }

    return { ok: problems.length === 0, problems };
  }

  present(
    question: { id: string; prompt: string; payload: unknown; points: number },
    { shuffleOptions, rng }: { shuffleOptions: boolean; rng: Rng },
  ): PresentedQuestion {
    const payload = question.payload as MatchingPayload;

    return {
      id: question.id,
      typeKey: this.key,
      prompt: question.prompt,
      payload: {
        // Shuffled separately, so their positions carry no hint.
        left: shuffleOptions ? shuffle(payload.left, rng) : payload.left,
        right: shuffleOptions ? shuffle(payload.right, rng) : payload.right,
      },
      points: question.points,
    };
  }

  grade(_payload: unknown, answerKey: unknown, response: unknown, points: number): GradeResult {
    const expected = (answerKey as MatchingAnswer).pairs;
    const given = (response as { pairs?: Record<string, string> } | null)?.pairs ?? {};

    const total = Object.keys(expected).length;
    const correct = Object.entries(expected).filter(([l, r]) => given[l] === r).length;

    // Partial credit, rounded down so a wrong pair always costs something.
    const pointsAwarded = total === 0 ? 0 : Math.floor((correct / total) * points);

    return { isCorrect: correct === total, pointsAwarded, expected };
  }
}
