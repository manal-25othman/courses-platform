import {
  GradeResult,
  PresentedQuestion,
  QuestionHandler,
  Rng,
  ValidationResult,
  shuffle,
} from '../question.types';

/** An option as authored. */
interface Option {
  id: string;
  text: string;
}

interface ChoicePayload {
  options: Option[];
}

interface ChoiceAnswer {
  correctOptionId: string;
}

/**
 * One correct option out of several.
 *
 * Used by every kind in the source that asks the student to pick: "Choose the
 * correct answer", "Choose the missing letter", "Choose and complete the
 * sentence", "Circle the odd one out", and matching a picture to a word. They
 * differ in how they are presented, not in how they are marked, so they share
 * this handler under different keys.
 */
export class ChoiceHandler implements QuestionHandler {
  constructor(readonly key: string) {}

  validate(payload: unknown, answerKey: unknown): ValidationResult {
    const problems: string[] = [];
    const p = payload as ChoicePayload | null;
    const a = answerKey as ChoiceAnswer | null;

    if (!p?.options || !Array.isArray(p.options) || p.options.length < 2) {
      problems.push('At least two options are needed.');
    } else {
      if (p.options.some((o) => !o?.id || typeof o.text !== 'string')) {
        problems.push('Every option needs an id and text.');
      }
      if (new Set(p.options.map((o) => o?.id)).size !== p.options.length) {
        problems.push('Option ids must be unique.');
      }
    }

    if (!a?.correctOptionId) {
      problems.push('No correct option is marked.');
    } else if (p?.options && !p.options.some((o) => o?.id === a.correctOptionId)) {
      problems.push('The correct option is not one of the options.');
    }

    return { ok: problems.length === 0, problems };
  }

  present(
    question: { id: string; prompt: string; payload: unknown; points: number },
    { shuffleOptions, rng }: { shuffleOptions: boolean; rng: Rng },
  ): PresentedQuestion {
    const payload = question.payload as ChoicePayload;
    const options = shuffleOptions ? shuffle(payload.options, rng) : payload.options;

    return {
      id: question.id,
      typeKey: this.key,
      prompt: question.prompt,
      // Only id and text: nothing here reveals which option is correct.
      payload: { options: options.map((o) => ({ id: o.id, text: o.text })) },
      points: question.points,
    };
  }

  grade(_payload: unknown, answerKey: unknown, response: unknown, points: number): GradeResult {
    const expected = (answerKey as ChoiceAnswer).correctOptionId;
    const given = (response as { optionId?: string } | null)?.optionId;
    const isCorrect = given === expected;

    return { isCorrect, pointsAwarded: isCorrect ? points : 0, expected };
  }
}
