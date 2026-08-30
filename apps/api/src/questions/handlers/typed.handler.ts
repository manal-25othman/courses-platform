import { GradeResult, PresentedQuestion, QuestionHandler, ValidationResult } from '../question.types';

interface TypedPayload {
  /** Optional picture, for "write the word for this picture". */
  mediaId?: string;
}

interface TypedAnswer {
  /**
   * Answers counted as correct. The first is the one from the curriculum;
   * any others are alternatives a teacher has added deliberately.
   *
   * Nothing is added here automatically. Inventing alternatives would mean
   * inventing curriculum, and leaving them out means a teacher decides.
   */
  accepted: string[];
  /** Whether capital letters must match. Off by default. */
  caseSensitive?: boolean;
  /** Whether punctuation and spacing must match. Off by default. */
  strictPunctuation?: boolean;
}

/**
 * The student types the answer.
 *
 * Covers spelling, writing the word for a picture, and short answers. These
 * are the kinds most likely to mark a correct answer wrong, because a single
 * expected string cannot anticipate every acceptable phrasing — which is why
 * accepted alternatives are a teacher's decision and never guessed.
 */
export class TypedAnswerHandler implements QuestionHandler {
  constructor(readonly key: string) {}

  validate(_payload: unknown, answerKey: unknown): ValidationResult {
    const a = answerKey as TypedAnswer | null;

    if (!a?.accepted?.length || a.accepted.every((t) => !t?.trim())) {
      return { ok: false, problems: ['No accepted answer is recorded.'] };
    }

    return { ok: true, problems: [] };
  }

  present(question: {
    id: string;
    prompt: string;
    payload: unknown;
    points: number;
  }): PresentedQuestion {
    const payload = question.payload as TypedPayload;

    return {
      id: question.id,
      typeKey: this.key,
      prompt: question.prompt,
      payload: payload?.mediaId ? { mediaId: payload.mediaId } : {},
      points: question.points,
    };
  }

  /** Trims and collapses spacing; the rest depends on the question's settings. */
  private normalise(text: string, answer: TypedAnswer): string {
    let value = text.trim().replace(/\s+/g, ' ');

    if (!answer.caseSensitive) value = value.toLowerCase();
    if (!answer.strictPunctuation) value = value.replace(/[.,!?;:'"]/g, '');

    return value;
  }

  grade(_payload: unknown, answerKey: unknown, response: unknown, points: number): GradeResult {
    const answer = answerKey as TypedAnswer;
    const given = (response as { text?: string } | null)?.text ?? '';

    const normalisedGiven = this.normalise(given, answer);
    const isCorrect = answer.accepted.some(
      (accepted) => this.normalise(accepted, answer) === normalisedGiven,
    );

    return {
      isCorrect,
      pointsAwarded: isCorrect ? points : 0,
      expected: answer.accepted,
    };
  }
}
