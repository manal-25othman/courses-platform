/**
 * What a journey is allowed to be built from, and what it is allowed to look
 * like. The planner is pure, so these are the game's rules stated plainly.
 */
import { describe, expect, it } from 'vitest';
import {
  AdventureSource,
  DEFAULT_ELIGIBLE_TYPES,
  MAXIMUM_CHECKPOINTS,
  isEligible,
  planAdventure,
} from './grammar-adventure';

function source(over: Partial<AdventureSource> & { id: string }): AdventureSource {
  return {
    typeKey: 'complete_sentence',
    prompt: 'She ___ to school every day.',
    payload: { options: [{ id: 'a', text: 'go' }, { id: 'b', text: 'goes' }] },
    fromGrammarSection: false,
    hint: null,
    ...over,
  };
}

const many = (n: number, over: Partial<AdventureSource> = {}) =>
  Array.from({ length: n }, (_, i) => source({ id: `q${i}`, ...over }));

describe('which questions can become an obstacle', () => {
  it('takes the kinds a thumb can answer', () => {
    for (const typeKey of ['complete_sentence', 'true_false', 'word_ordering']) {
      expect(isEligible(source({ id: '1', typeKey }), DEFAULT_ELIGIBLE_TYPES)).toBe(true);
    }
  });

  it('leaves typed answers out: a keyboard is not a way through a world', () => {
    expect(isEligible(source({ id: '1', typeKey: 'spelling' }), DEFAULT_ELIGIBLE_TYPES)).toBe(false);
    expect(
      isEligible(source({ id: '1', typeKey: 'grammar_transformation' }), DEFAULT_ELIGIBLE_TYPES),
    ).toBe(false);
  });

  /**
   * The rule that keeps a vocabulary quiz out of a grammar game. A unit's
   * multiple-choice questions are as often about what a word means as about
   * how a sentence is built, and the only thing in the data that tells them
   * apart is the teacher having tied one to a grammar page.
   */
  it('admits multiple choice only where the teacher tied it to grammar', () => {
    expect(
      isEligible(source({ id: '1', typeKey: 'multiple_choice' }), DEFAULT_ELIGIBLE_TYPES),
    ).toBe(false);
    expect(
      isEligible(
        source({ id: '1', typeKey: 'multiple_choice', fromGrammarSection: true }),
        DEFAULT_ELIGIBLE_TYPES,
      ),
    ).toBe(true);
  });

  it('obeys a school that names its own kinds', () => {
    expect(isEligible(source({ id: '1', typeKey: 'true_false' }), ['complete_sentence'])).toBe(false);
  });

  it('skips a question offering nothing to choose between', () => {
    const plan = planAdventure([source({ id: '1', payload: {} })], 'seed');
    expect(plan.checkpoints).toHaveLength(0);
  });
});

describe('the shape of a journey', () => {
  it('is never longer than one sitting', () => {
    expect(planAdventure(many(20), 'seed').checkpoints).toHaveLength(MAXIMUM_CHECKPOINTS);
  });

  it('ends at the destination, whatever the last question asks', () => {
    const plan = planAdventure(many(5), 'seed');
    expect(plan.checkpoints.at(-1)?.kind).toBe('final');
  });

  /** A road of six identical gates is a quiz with scenery. */
  it('does not put the same obstacle twice in a row where it can avoid it', () => {
    const plan = planAdventure(many(6), 'seed');
    const middle = plan.checkpoints.slice(0, -1);
    const repeats = middle.filter((c, i) => i > 0 && c.kind === middle[i - 1].kind);
    expect(repeats).toHaveLength(0);
  });

  /**
   * The obstacle follows the question's own shape: words to put in order are
   * planks to lay, and a sentence to judge is a sign that may be lying. The
   * last stop is the destination whatever it asks, so it is excluded here.
   */
  it('makes a bridge of words to put in order and a sign of true or false', () => {
    const plan = planAdventure(
      [
        source({ id: 'a', typeKey: 'word_ordering', payload: { tokens: [] } }),
        source({ id: 'b', typeKey: 'true_false', payload: {} }),
        ...many(4),
      ],
      'seed',
    );
    const before = plan.checkpoints.slice(0, -1);
    expect(before.find((c) => c.questionId === 'a')?.kind ?? 'bridge').toBe('bridge');
    expect(before.find((c) => c.questionId === 'b')?.kind ?? 'signpost').toBe('signpost');
    expect(before.filter((c) => c.typeKey === 'complete_sentence').every((c) => c.kind === 'path' || c.kind === 'gate')).toBe(true);
  });

  it('stops at the grammar questions first', () => {
    const plan = planAdventure(
      [...many(4), ...many(2, { fromGrammarSection: true }).map((q, i) => ({ ...q, id: `g${i}` }))],
      'seed',
    );
    expect(plan.checkpoints.slice(0, 2).every((c) => c.questionId.startsWith('g'))).toBe(true);
  });

  it('carries the teacher’s hint and never writes one', () => {
    const plan = planAdventure([source({ id: '1', hint: 'Use "goes" with she.' }), ...many(2)], 'seed');
    expect(plan.checkpoints.find((c) => c.questionId === '1')?.hint).toBe('Use "goes" with she.');
    expect(plan.checkpoints.find((c) => c.questionId === 'q0')?.hint).toBeNull();
  });

  /** Nothing in a round may carry an answer; it only ever carries what was presented. */
  it('holds nothing but what the engine already presented', () => {
    const plan = planAdventure([source({ id: '1' }), ...many(2)], 'seed');
    expect(JSON.stringify(plan)).not.toContain('correctOptionId');
    expect(JSON.stringify(plan)).not.toContain('answerKey');
  });

  it('walks a different way on a second go', () => {
    const a = planAdventure(many(12), 'one').checkpoints.map((c) => c.questionId);
    const b = planAdventure(many(12), 'two').checkpoints.map((c) => c.questionId);
    expect(a).not.toEqual(b);
  });
});
