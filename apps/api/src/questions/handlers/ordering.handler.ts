import {
  GradeResult,
  PresentedQuestion,
  QuestionHandler,
  Rng,
  ValidationResult,
  shuffle,
} from '../question.types';

interface OrderingPayload {
  tokens: { id: string; text: string }[];
}

interface OrderingAnswer {
  /** Token ids in their correct order. */
  order: string[];
}

/**
 * Put the words in order to make a sentence.
 *
 * The words are shuffled for display; without that the question would already
 * be answered.
 */
export class OrderingHandler implements QuestionHandler {
  readonly key = 'word_ordering';

  validate(payload: unknown, answerKey: unknown): ValidationResult {
    const problems: string[] = [];
    const p = payload as OrderingPayload | null;
    const a = answerKey as OrderingAnswer | null;

    if (!p?.tokens || p.tokens.length < 2) {
      problems.push('At least two words are needed.');
    }

    if (!a?.order?.length) {
      problems.push('The correct order is missing.');
    } else if (p?.tokens) {
      const ids = new Set(p.tokens.map((t) => t.id));

      if (a.order.length !== p.tokens.length) {
        problems.push('The correct order must include every word exactly once.');
      }
      if (a.order.some((id) => !ids.has(id))) {
        problems.push('The correct order refers to a word that is not in the list.');
      }
      if (new Set(a.order).size !== a.order.length) {
        problems.push('The correct order repeats a word.');
      }
    }

    return { ok: problems.length === 0, problems };
  }

  present(
    question: { id: string; prompt: string; payload: unknown; points: number },
    { shuffleOptions, rng }: { shuffleOptions: boolean; rng: Rng },
  ): PresentedQuestion {
    const payload = question.payload as OrderingPayload;

    return {
      id: question.id,
      typeKey: this.key,
      prompt: question.prompt,
      payload: { tokens: shuffleOptions ? shuffle(payload.tokens, rng) : payload.tokens },
      points: question.points,
    };
  }

  grade(_payload: unknown, answerKey: unknown, response: unknown, points: number): GradeResult {
    const expected = (answerKey as OrderingAnswer).order;
    const given = (response as { order?: string[] } | null)?.order ?? [];

    const isCorrect =
      given.length === expected.length && given.every((id, i) => id === expected[i]);

    return { isCorrect, pointsAwarded: isCorrect ? points : 0, expected };
  }
}
