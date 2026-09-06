/**
 * Says what an import would write, from the extraction alone.
 *
 * The importers cannot be asked this before the units exist — they refuse to
 * create a unit, because inventing curriculum structure is what none of them
 * may do — so on an empty database a dry run of them says only that. This
 * reads the three extracted files instead and reports the same thing they
 * would: how much, of what, filed where, and how much of it needs a teacher.
 *
 * Reads nothing but files. Touches no database.
 *
 *   node report-extraction.mjs <questions.json> <vocabulary.json> <activities.json>
 */
import { readFileSync } from 'node:fs';

const [questionsPath, vocabularyPath, activitiesPath] = process.argv.slice(2);

if (!questionsPath || !vocabularyPath || !activitiesPath) {
  console.error('usage: report-extraction.mjs <questions.json> <vocabulary.json> <activities.json>');
  process.exit(2);
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const questions = read(questionsPath);
const vocabulary = read(vocabularyPath);
const activities = read(activitiesPath);

const units = new Map();
const bump = (unit, key, n = 1) => {
  const name = unit ?? '(unattributed)';
  const row = units.get(name) ?? { questions: 0, activities: 0, words: 0, review: 0, pictures: 0 };
  row[key] += n;
  units.set(name, row);
};

for (const q of questions.questions) {
  bump(q.unit, 'questions');
  if (q.needsReview) bump(q.unit, 'review');
}
for (const q of activities.questions) {
  bump(q.unit, 'activities');
  if (q.needsReview) bump(q.unit, 'review');
  if (q.images?.length) bump(q.unit, 'pictures', q.images.length);
}
for (const w of vocabulary.words) bump(w.unit, 'words');

console.log('\nWhat this source yields, unit by unit.\n');
console.log('  unit             questions  activities  pictures  words  need a teacher');
console.log('  ' + '-'.repeat(69));

const totals = { questions: 0, activities: 0, words: 0, review: 0, pictures: 0 };

for (const [name, row] of units) {
  console.log(
    `  ${name.padEnd(17)}${String(row.questions).padStart(6)}${String(row.activities).padStart(12)}` +
      `${String(row.pictures).padStart(10)}${String(row.words).padStart(7)}${String(row.review).padStart(16)}`,
  );
  for (const k of Object.keys(totals)) totals[k] += row[k];
}

console.log('  ' + '-'.repeat(69));
console.log(
  `  ${'total'.padEnd(17)}${String(totals.questions).padStart(6)}${String(totals.activities).padStart(12)}` +
    `${String(totals.pictures).padStart(10)}${String(totals.words).padStart(7)}${String(totals.review).padStart(16)}`,
);

console.log('');
console.log(`  ${totals.questions + totals.activities} questions in total, of which ${totals.review} carry no answer`);
console.log('  because the source states the question but not what the answer is. Those');
console.log('  are stored unanswered and marked, never guessed at.');

const kinds = { ...questions.summary.byType };
for (const q of activities.questions) kinds[q.type] = (kinds[q.type] ?? 0) + 1;

console.log('');
console.log('  by kind:');
for (const [type, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${type.padEnd(20)} ${n}`);
}

console.log('');
console.log('  Everything arrives as a draft. No girl sees any of it until her teacher');
console.log('  publishes it from her own screens.\n');
