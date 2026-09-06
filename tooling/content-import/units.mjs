/**
 * The six bands the source document is divided into, in the order it puts them.
 *
 * Kept here rather than inside the extractor because two things now need it
 * and the extractor cannot be imported for one line: reading it runs it, and
 * running it needs a document. Nothing is authored here — these are the
 * headings the file itself carries, and the list is the one the extractor has
 * always filed questions against.
 */
export const UNIT_TITLES = [
  'Welcome',
  'Living Things',
  'Lifestyles',
  'Interests',
  'Professions',
  'Grammar Review',
];
