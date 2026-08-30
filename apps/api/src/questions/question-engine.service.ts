import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChoiceHandler } from './handlers/choice.handler';
import { MatchingHandler } from './handlers/matching.handler';
import { OrderingHandler } from './handlers/ordering.handler';
import { TrueFalseHandler } from './handlers/true-false.handler';
import { TypedAnswerHandler } from './handlers/typed.handler';
import {
  GradeResult,
  PresentedQuestion,
  QuestionHandler,
  createRng,
  shuffle,
} from './question.types';

/** A question as stored. */
export interface StoredQuestion {
  id: string;
  typeKey: string;
  prompt: string;
  payload: unknown;
  answerKey: unknown;
  points: number;
}

export interface PresentOptions {
  seed: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Draw this many at random. Undefined uses every question (SRS 9). */
  questionCount?: number;
}

export interface ScoredAttempt {
  results: (GradeResult & { questionId: string })[];
  correctCount: number;
  incorrectCount: number;
  pointsAwarded: number;
  pointsAvailable: number;
  /** Rounded to a whole number, as the pass mark is compared as one (SRS 17). */
  scorePercent: number;
}

/**
 * The Question Engine.
 *
 * Every kind of question is handled through one interface, so the rest of the
 * system — sets, attempts, marking, screens — never needs to know which kind
 * it is dealing with. A new kind is a handler and a row (SRS 10, 44).
 */
@Injectable()
export class QuestionEngineService {
  private readonly handlers = new Map<string, QuestionHandler>();

  constructor() {
    // Several kinds present differently but are marked the same way, so they
    // share a handler registered under their own key.
    for (const key of [
      'multiple_choice',
      'missing_letter',
      'odd_one_out',
      'complete_sentence',
      'picture_matching',
    ]) {
      this.register(new ChoiceHandler(key));
    }

    for (const key of ['spelling', 'short_answer', 'picture_word', 'grammar_transformation']) {
      this.register(new TypedAnswerHandler(key));
    }

    this.register(new TrueFalseHandler());
    this.register(new MatchingHandler());
    this.register(new OrderingHandler());
  }

  private register(handler: QuestionHandler): void {
    this.handlers.set(handler.key, handler);
  }

  /** The kinds the engine can handle. */
  supportedTypes(): string[] {
    return [...this.handlers.keys()].sort();
  }

  handlerFor(typeKey: string): QuestionHandler {
    const handler = this.handlers.get(typeKey);

    if (!handler) {
      throw new NotFoundException(`No handler is registered for "${typeKey}".`);
    }

    return handler;
  }

  /** Checks a question before it is saved. */
  validate(typeKey: string, payload: unknown, answerKey: unknown) {
    return this.handlerFor(typeKey).validate(payload, answerKey);
  }

  /** Throws if a question is not well formed, listing what is wrong. */
  assertValid(typeKey: string, payload: unknown, answerKey: unknown): void {
    const result = this.validate(typeKey, payload, answerKey);

    if (!result.ok) {
      throw new BadRequestException(result.problems.join(' '));
    }
  }

  /**
   * Builds the set a student sees.
   *
   * Order and options come from the seed, so the same attempt always looks the
   * same however many times she returns to it (SRS 11 with SRS 23). Nothing
   * returned here contains an answer.
   */
  present(questions: StoredQuestion[], options: PresentOptions): PresentedQuestion[] {
    const rng = createRng(options.seed);

    let selected = options.shuffleQuestions ? shuffle(questions, rng) : [...questions];

    if (options.questionCount !== undefined && options.questionCount < selected.length) {
      selected = selected.slice(0, options.questionCount);
    }

    return selected.map((question) =>
      this.handlerFor(question.typeKey).present(question, {
        shuffleOptions: options.shuffleOptions,
        rng,
      }),
    );
  }

  /** Marks one response. */
  grade(question: StoredQuestion, response: unknown): GradeResult {
    return this.handlerFor(question.typeKey).grade(
      question.payload,
      question.answerKey,
      response,
      question.points,
    );
  }

  /**
   * Marks a whole attempt and works out the score.
   *
   * Returns the five figures SRS 47 requires: correct, incorrect, percentage,
   * and the totals the pass mark is compared against. Whether that percentage
   * passes is decided elsewhere, against the configured pass mark, because the
   * mark is a setting rather than a constant (SRS 17).
   */
  score(questions: StoredQuestion[], responses: Record<string, unknown>): ScoredAttempt {
    const results = questions.map((question) => ({
      questionId: question.id,
      ...this.grade(question, responses[question.id] ?? null),
    }));

    const pointsAvailable = questions.reduce((total, q) => total + q.points, 0);
    const pointsAwarded = results.reduce((total, r) => total + r.pointsAwarded, 0);
    const correctCount = results.filter((r) => r.isCorrect).length;

    return {
      results,
      correctCount,
      incorrectCount: results.length - correctCount,
      pointsAwarded,
      pointsAvailable,
      scorePercent:
        pointsAvailable === 0 ? 0 : Math.round((pointsAwarded / pointsAvailable) * 100),
    };
  }
}
