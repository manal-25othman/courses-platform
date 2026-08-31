import { createRng, shuffle } from '../questions/question.types';

/** A word as it is stored, for the purpose of building a check. */
export interface CheckableWord {
  id: string;
  wordEn: string;
  meaningAr: string | null;
}

export interface VocabularyCheck {
  itemId: string;
  /** The English word she is being asked about. */
  wordEn: string;
  /** Meanings to choose between. One is right; the rest are other real words'. */
  options: { id: string; text: string }[];
}

export type CheckRefusal =
  | 'no_meaning'
  | 'not_enough_other_words';

export interface CheckResult {
  check: VocabularyCheck | null;
  /** Why no check could be built, when one could not. */
  refusedBecause?: CheckRefusal;
}

/**
 * How many choices a check must offer before it means anything.
 *
 * With two, a student who knows nothing is right half the time. Three is the
 * least that makes a correct answer evidence of something.
 */
export const MINIMUM_OPTIONS = 3;

/**
 * Builds the check for one word.
 *
 * Everything in it is content a teacher entered: the word, its meaning, and —
 * as the wrong choices — the meanings of other words in the same unit. Nothing
 * is written here, and no meaning is translated, shortened or invented. If the
 * unit does not hold enough real material to ask a fair question, this returns
 * nothing and says why, rather than making something up (client, 2026-08-30).
 *
 * @param seed fixes the order, so a reload shows the same question and a fresh
 *   try shows a different one.
 */
export function buildCheck(
  word: CheckableWord,
  others: CheckableWord[],
  seed: string,
): CheckResult {
  const answer = word.meaningAr?.trim();

  // A word with no meaning recorded cannot be asked about at all.
  if (!answer) {
    return { check: null, refusedBecause: 'no_meaning' };
  }

  // Wrong choices are other words' real meanings. Duplicates of the right
  // answer are dropped: two identical choices would make the question unfair
  // in the other direction.
  const distractors: string[] = [];
  const seen = new Set([answer]);

  for (const other of others) {
    const meaning = other.meaningAr?.trim();
    if (!meaning || other.id === word.id || seen.has(meaning)) continue;
    seen.add(meaning);
    distractors.push(meaning);
  }

  if (distractors.length + 1 < MINIMUM_OPTIONS) {
    return { check: null, refusedBecause: 'not_enough_other_words' };
  }

  const rng = createRng(seed);
  // At most three wrong choices, so the question stays readable on a phone.
  const chosen = shuffle(distractors, rng).slice(0, MINIMUM_OPTIONS);
  const options = shuffle([answer, ...chosen], rng).map((text, index) => ({
    id: String.fromCharCode(97 + index),
    text,
  }));

  return { check: { itemId: word.id, wordEn: word.wordEn, options } };
}

/**
 * Whether an answer is the right one.
 *
 * Compared against the meaning itself rather than an option letter, because
 * the letters are only positions in a shuffle and mean nothing on their own.
 */
export function isCorrectAnswer(word: CheckableWord, chosenText: string): boolean {
  const answer = word.meaningAr?.trim();
  return Boolean(answer) && answer === chosenText.trim();
}

/** Said to the teacher, in her words, when a word cannot be checked. */
export function explainRefusal(reason: CheckRefusal): string {
  return reason === 'no_meaning'
    ? 'This word has no Arabic meaning recorded, so there is nothing to check it against.'
    : 'This unit needs at least three words with Arabic meanings before a check can be asked.';
}
