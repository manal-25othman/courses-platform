import { describe, expect, it } from 'vitest';
import { buildCheck, isCorrectAnswer, MINIMUM_OPTIONS } from './vocabulary-check';

const lion = { id: 'w1', wordEn: 'lion', meaningAr: 'أسد' };
const mountain = { id: 'w2', wordEn: 'mountain', meaningAr: 'جبل' };
const giant = { id: 'w3', wordEn: 'giant', meaningAr: 'عملاق' };
const river = { id: 'w4', wordEn: 'river', meaningAr: 'نهر' };

describe('the vocabulary check is built only from what the teacher entered', () => {
  it('asks about the word and offers its real meaning', () => {
    const { check } = buildCheck(lion, [mountain, giant, river], 'seed');

    expect(check?.wordEn).toBe('lion');
    expect(check?.options.map((o) => o.text)).toContain('أسد');
  });

  /**
   * The whole point of the rule: every wrong choice is another word's real
   * meaning. Nothing here writes Arabic, and nothing translates anything.
   */
  it('uses other words’ real meanings as the wrong choices', () => {
    const { check } = buildCheck(lion, [mountain, giant, river], 'seed');
    const entered = ['أسد', 'جبل', 'عملاق', 'نهر'];

    for (const option of check!.options) {
      expect(entered).toContain(option.text);
    }
  });

  it('offers enough choices to mean something', () => {
    const { check } = buildCheck(lion, [mountain, giant, river], 'seed');

    expect(check!.options.length).toBeGreaterThanOrEqual(MINIMUM_OPTIONS);
  });

  it('gives the same question for the same seed and a different one otherwise', () => {
    const a = buildCheck(lion, [mountain, giant, river], 'seed-1').check!;
    const b = buildCheck(lion, [mountain, giant, river], 'seed-1').check!;
    const c = buildCheck(lion, [mountain, giant, river], 'seed-2').check!;

    expect(a.options.map((o) => o.text)).toEqual(b.options.map((o) => o.text));
    expect(a.options.map((o) => o.text)).not.toEqual(c.options.map((o) => o.text));
  });

  it('never offers the same meaning twice', () => {
    const twin = { id: 'w5', wordEn: 'big cat', meaningAr: 'أسد' };
    const { check } = buildCheck(lion, [twin, mountain, giant], 'seed');
    const texts = check!.options.map((o) => o.text);

    expect(new Set(texts).size).toBe(texts.length);
  });

  it('never puts the word under test in as its own wrong choice', () => {
    const { check } = buildCheck(lion, [lion, mountain, giant], 'seed');

    expect(check!.options.filter((o) => o.text === 'أسد')).toHaveLength(1);
  });
});

describe('the check refuses rather than guessing', () => {
  /**
   * The client's instruction: where there is not enough teacher-entered
   * material, do not invent a question. These two cases are the whole of it.
   */
  it('refuses when the word has no meaning recorded', () => {
    const { check, refusedBecause } = buildCheck(
      { id: 'w9', wordEn: 'orphan', meaningAr: null },
      [mountain, giant, river],
      'seed',
    );

    expect(check).toBeNull();
    expect(refusedBecause).toBe('no_meaning');
  });

  it('refuses when the word’s meaning is only whitespace', () => {
    const { check, refusedBecause } = buildCheck(
      { id: 'w9', wordEn: 'orphan', meaningAr: '   ' },
      [mountain, giant, river],
      'seed',
    );

    expect(check).toBeNull();
    expect(refusedBecause).toBe('no_meaning');
  });

  it('refuses when the unit has too few other words to choose between', () => {
    const { check, refusedBecause } = buildCheck(lion, [mountain], 'seed');

    expect(check).toBeNull();
    expect(refusedBecause).toBe('not_enough_other_words');
  });

  it('refuses when the other words have no meanings to offer', () => {
    const { check, refusedBecause } = buildCheck(
      lion,
      [
        { id: 'a', wordEn: 'one', meaningAr: null },
        { id: 'b', wordEn: 'two', meaningAr: null },
      ],
      'seed',
    );

    expect(check).toBeNull();
    expect(refusedBecause).toBe('not_enough_other_words');
  });

  it('accepts the smallest unit that can be asked about fairly', () => {
    const { check } = buildCheck(lion, [mountain, giant], 'seed');

    expect(check?.options).toHaveLength(MINIMUM_OPTIONS);
  });
});

describe('marking the check', () => {
  it('accepts the recorded meaning', () => {
    expect(isCorrectAnswer(lion, 'أسد')).toBe(true);
  });

  it('ignores surrounding spaces', () => {
    expect(isCorrectAnswer(lion, '  أسد  ')).toBe(true);
  });

  it('rejects another word’s meaning', () => {
    expect(isCorrectAnswer(lion, 'جبل')).toBe(false);
  });

  it('rejects anything when no meaning was recorded', () => {
    expect(isCorrectAnswer({ id: 'x', wordEn: 'x', meaningAr: null }, '')).toBe(false);
  });
});
