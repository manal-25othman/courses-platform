import { GradeResult, PresentedQuestion, QuestionHandler, ValidationResult } from '../question.types';

interface TrueFalseAnswer {
  correct: boolean;
}

/**
 * A statement marked true or false.
 *
 * In the source these are written as a sentence followed by ( T ) or ( F ).
 * There is nothing to shuffle: the two choices always read the same way round.
 */
export class TrueFalseHandler implements QuestionHandler {
  readonly key = 'true_false';

  validate(_payload: unknown, answerKey: unknown): ValidationResult {
    const a = answerKey as TrueFalseAnswer | null;

    return typeof a?.correct === 'boolean'
      ? { ok: true, problems: [] }
      : { ok: false, problems: ['The answer must be either true or false.'] };
  }

  present(question: {
    id: string;
    prompt: string;
    payload: unknown;
    points: number;
  }): PresentedQuestion {
    return {
      id: question.id,
      typeKey: this.key,
      prompt: question.prompt,
      payload: {},
      points: question.points,
    };
  }

  grade(_payload: unknown, answerKey: unknown, response: unknown, points: number): GradeResult {
    const expected = (answerKey as TrueFalseAnswer).correct;
    const given = (response as { value?: boolean } | null)?.value;
    const isCorrect = given === expected;

    return { isCorrect, pointsAwarded: isCorrect ? points : 0, expected };
  }
}
