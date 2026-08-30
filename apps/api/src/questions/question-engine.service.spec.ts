import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { QuestionEngineService, StoredQuestion } from './question-engine.service';
import { createRng, shuffle } from './question.types';

/** Builds a question of the given kind with sensible content. */
const mcq = (id = 'q1'): StoredQuestion => ({
  id,
  typeKey: 'multiple_choice',
  prompt: 'Insects ……….... by other animals.',
  payload: {
    options: [
      { id: 'a', text: 'eat' },
      { id: 'b', text: 'eating' },
      { id: 'c', text: 'are eaten' },
    ],
  },
  answerKey: { correctOptionId: 'c' },
  points: 1,
});

const trueFalse: StoredQuestion = {
  id: 'tf1',
  typeKey: 'true_false',
  prompt: 'Camels live in the ocean.',
  payload: {},
  answerKey: { correct: false },
  points: 1,
};

const matching: StoredQuestion = {
  id: 'm1',
  typeKey: 'matching',
  prompt: 'Match the correct answer',
  payload: {
    left: [
      { id: 'l1', text: 'How many months of the year?' },
      { id: 'l2', text: 'What is the first month?' },
    ],
    right: [
      { id: 'r1', text: 'Twelve.' },
      { id: 'r2', text: 'January.' },
    ],
  },
  answerKey: { pairs: { l1: 'r1', l2: 'r2' } },
  points: 2,
};

const ordering: StoredQuestion = {
  id: 'o1',
  typeKey: 'word_ordering',
  prompt: 'Order the words to make a sentence',
  payload: {
    tokens: [
      { id: 't1', text: 'The' },
      { id: 't2', text: 'jungle' },
      { id: 't3', text: 'is' },
    ],
  },
  answerKey: { order: ['t1', 't2', 't3'] },
  points: 1,
};

const spelling: StoredQuestion = {
  id: 's1',
  typeKey: 'spelling',
  prompt: 'Write the correct spelling under the picture',
  payload: { mediaId: 'img-1' },
  answerKey: { accepted: ['butterfly'] },
  points: 1,
};

describe('QuestionEngineService', () => {
  let engine: QuestionEngineService;

  beforeEach(() => {
    engine = new QuestionEngineService();
  });

  it('handles every kind found in the curriculum', () => {
    // grammar_transformation is registered because SRS 10 names it, even
    // though the supplied material contains none.
    expect(engine.supportedTypes()).toEqual([
      'complete_sentence',
      'grammar_transformation',
      'matching',
      'missing_letter',
      'multiple_choice',
      'odd_one_out',
      'picture_matching',
      'picture_word',
      'short_answer',
      'spelling',
      'true_false',
      'word_ordering',
    ]);
  });

  describe('answers never reach the student', () => {
    it('leaves no trace of the correct option in a choice question', () => {
      const shown = engine.present([mcq()], {
        seed: 'x',
        shuffleQuestions: false,
        shuffleOptions: false,
      })[0];

      expect(JSON.stringify(shown)).not.toContain('correctOptionId');
      expect(shown.payload).toEqual({
        options: [
          { id: 'a', text: 'eat' },
          { id: 'b', text: 'eating' },
          { id: 'c', text: 'are eaten' },
        ],
      });
    });

    it.each([
      ['true/false', trueFalse, 'correct'],
      ['matching', matching, 'pairs'],
      ['ordering', ordering, 'order'],
      ['spelling', spelling, 'accepted'],
    ])('leaves no answer in a %s question', (_label, question, answerField) => {
      const shown = engine.present([question], {
        seed: 'x',
        shuffleQuestions: false,
        shuffleOptions: false,
      })[0];

      expect(JSON.stringify(shown.payload)).not.toContain(answerField);
    });
  });

  describe('marking', () => {
    it('marks the right option correct and any other wrong', () => {
      expect(engine.grade(mcq(), { optionId: 'c' })).toMatchObject({
        isCorrect: true,
        pointsAwarded: 1,
      });
      expect(engine.grade(mcq(), { optionId: 'a' })).toMatchObject({
        isCorrect: false,
        pointsAwarded: 0,
      });
    });

    it('treats no answer as wrong rather than failing', () => {
      expect(engine.grade(mcq(), null)).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
    });

    it('marks true/false', () => {
      expect(engine.grade(trueFalse, { value: false }).isCorrect).toBe(true);
      expect(engine.grade(trueFalse, { value: true }).isCorrect).toBe(false);
    });

    it('gives part marks for a partly correct matching answer', () => {
      const result = engine.grade(matching, { pairs: { l1: 'r1', l2: 'r1' } });

      expect(result.isCorrect).toBe(false);
      // One pair of two, worth two points, so one point.
      expect(result.pointsAwarded).toBe(1);
    });

    it('gives full marks when every pair is right', () => {
      expect(engine.grade(matching, { pairs: { l1: 'r1', l2: 'r2' } })).toMatchObject({
        isCorrect: true,
        pointsAwarded: 2,
      });
    });

    it('requires the exact order for an ordering question', () => {
      expect(engine.grade(ordering, { order: ['t1', 't2', 't3'] }).isCorrect).toBe(true);
      expect(engine.grade(ordering, { order: ['t2', 't1', 't3'] }).isCorrect).toBe(false);
    });

    describe('typed answers', () => {
      it('accepts the exact answer', () => {
        expect(engine.grade(spelling, { text: 'butterfly' }).isCorrect).toBe(true);
      });

      it('ignores surrounding spaces and capitals', () => {
        expect(engine.grade(spelling, { text: '  Butterfly ' }).isCorrect).toBe(true);
      });

      it('marks a different word wrong', () => {
        expect(engine.grade(spelling, { text: 'butterflies' }).isCorrect).toBe(false);
      });

      /**
       * The engine never invents alternatives. "can not" is only accepted if a
       * teacher has said so, because guessing would be inventing curriculum.
       */
      it('does not accept an alternative nobody recorded', () => {
        const q: StoredQuestion = {
          ...spelling,
          answerKey: { accepted: ['cannot'] },
        };

        expect(engine.grade(q, { text: 'can not' }).isCorrect).toBe(false);
      });

      it('accepts an alternative a teacher did record', () => {
        const q: StoredQuestion = {
          ...spelling,
          answerKey: { accepted: ['cannot', 'can not'] },
        };

        expect(engine.grade(q, { text: 'can not' }).isCorrect).toBe(true);
      });
    });
  });

  describe('shuffling', () => {
    it('gives the same order for the same seed, so a resumed attempt matches', () => {
      const once = engine.present([mcq('a'), mcq('b'), mcq('c')], {
        seed: 'attempt-42',
        shuffleQuestions: true,
        shuffleOptions: true,
      });
      const again = engine.present([mcq('a'), mcq('b'), mcq('c')], {
        seed: 'attempt-42',
        shuffleQuestions: true,
        shuffleOptions: true,
      });

      expect(JSON.stringify(once)).toBe(JSON.stringify(again));
    });

    it('gives a different order for a different seed', () => {
      const many = ['1', '2', '3', '4', '5', '6', '7', '8'].map((i) => mcq(i));
      const a = engine.present(many, { seed: 's1', shuffleQuestions: true, shuffleOptions: false });
      const b = engine.present(many, { seed: 's2', shuffleQuestions: true, shuffleOptions: false });

      expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
    });

    it('keeps the original order when shuffling is off', () => {
      const shown = engine.present([mcq('a'), mcq('b'), mcq('c')], {
        seed: 'x',
        shuffleQuestions: false,
        shuffleOptions: false,
      });

      expect(shown.map((q) => q.id)).toEqual(['a', 'b', 'c']);
    });

    it('shuffles options without losing or duplicating any', () => {
      const shown = engine.present([mcq()], {
        seed: 'seed-9',
        shuffleQuestions: false,
        shuffleOptions: true,
      })[0];
      const ids = (shown.payload.options as { id: string }[]).map((o) => o.id).sort();

      expect(ids).toEqual(['a', 'b', 'c']);
    });

    /** Both columns move, so their positions give nothing away (SRS 55). */
    it('shuffles both matching columns independently', () => {
      const bigger: StoredQuestion = {
        ...matching,
        payload: {
          left: Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, text: `left ${i}` })),
          right: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, text: `right ${i}` })),
        },
        answerKey: {
          pairs: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`l${i}`, `r${i}`])),
        },
      };

      const shown = engine.present([bigger], {
        seed: 'match-seed',
        shuffleQuestions: false,
        shuffleOptions: true,
      })[0];

      const left = (shown.payload.left as { id: string }[]).map((i) => i.id);
      const right = (shown.payload.right as { id: string }[]).map((i) => i.id);

      expect(left.length).toBe(6);
      expect(right.length).toBe(6);
      // If the two columns moved together, position n on the left would still
      // pair with position n on the right, which would give the answer away.
      const stillAligned = left.every((l, i) => l.replace('l', '') === right[i].replace('r', ''));
      expect(stillAligned).toBe(false);
    });

    it('draws a limited number when a set asks for one (SRS 9)', () => {
      const many = Array.from({ length: 10 }, (_, i) => mcq(`q${i}`));
      const shown = engine.present(many, {
        seed: 'x',
        shuffleQuestions: true,
        shuffleOptions: false,
        questionCount: 4,
      });

      expect(shown).toHaveLength(4);
    });
  });

  describe('scoring (SRS 47)', () => {
    it('reports correct, incorrect and a percentage', () => {
      const questions = [mcq('a'), mcq('b'), mcq('c'), mcq('d')];
      const score = engine.score(questions, {
        a: { optionId: 'c' },
        b: { optionId: 'c' },
        c: { optionId: 'a' },
        d: null,
      });

      expect(score.correctCount).toBe(2);
      expect(score.incorrectCount).toBe(2);
      expect(score.scorePercent).toBe(50);
    });

    /** 80% is the pass mark, so the boundary has to land exactly (SRS 17). */
    it('lands exactly on the pass boundary', () => {
      const questions = Array.from({ length: 10 }, (_, i) => mcq(`q${i}`));
      const responses = Object.fromEntries(
        questions.map((q, i) => [q.id, { optionId: i < 8 ? 'c' : 'a' }]),
      );

      expect(engine.score(questions, responses).scorePercent).toBe(80);
    });

    it('counts part marks from matching towards the total', () => {
      const score = engine.score([matching], { m1: { pairs: { l1: 'r1', l2: 'r1' } } });

      expect(score.pointsAwarded).toBe(1);
      expect(score.pointsAvailable).toBe(2);
      expect(score.scorePercent).toBe(50);
    });

    it('scores an empty set as zero rather than dividing by zero', () => {
      expect(engine.score([], {}).scorePercent).toBe(0);
    });
  });

  describe('validation', () => {
    it('rejects a choice question whose answer is not one of the options', () => {
      expect(() =>
        engine.assertValid('multiple_choice', { options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }] }, { correctOptionId: 'zz' }),
      ).toThrow(BadRequestException);
    });

    it('rejects a typed question with no accepted answer', () => {
      expect(engine.validate('spelling', {}, { accepted: [] }).ok).toBe(false);
    });

    it('rejects matching pairs that do not cover every left item', () => {
      const result = engine.validate(
        'matching',
        { left: [{ id: 'l1', text: 'a' }, { id: 'l2', text: 'b' }], right: [{ id: 'r1', text: 'c' }] },
        { pairs: { l1: 'r1' } },
      );

      expect(result.ok).toBe(false);
    });

    it('accepts a well formed question', () => {
      expect(engine.validate('multiple_choice', mcq().payload, mcq().answerKey).ok).toBe(true);
    });
  });

  describe('the shuffle itself', () => {
    it('keeps every item exactly once', () => {
      const items = Array.from({ length: 50 }, (_, i) => i);
      const result = shuffle(items, createRng('seed'));

      expect(result.sort((a, b) => a - b)).toEqual(items);
    });
  });
});
