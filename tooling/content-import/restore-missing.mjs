/**
 * Puts back curriculum questions that the source document still contains but
 * the database has lost.
 *
 * Written after a verification script deleted eight imported Lifestyles
 * questions with a `deleteMany` scoped to a whole unit. The safe way back is
 * not to re-run the import — that would duplicate the seventy-one questions
 * still present — but to insert only what is demonstrably absent.
 *
 * `source_ref` is the identity used for that comparison. The extractor derives
 * it from the paragraph's position in the document, so the same file always
 * yields the same reference for the same question, and a reference already in
 * the database means the question is already there.
 *
 * Nothing existing is read for update, altered or deleted. Every insert is a
 * DRAFT, and an answer the extractor could not read stays flagged for the
 * teacher rather than being guessed at.
 *
 *   DIRECT_URL=… node restore-missing.mjs <extracted.json> [--unit "Lifestyles"]
 *
 * Run with DRY=1 to see what would be inserted without writing anything.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../prisma-client.mjs';

const DRY = process.env.DRY === '1';
const path = process.argv[2];
const unitFlag = process.argv.indexOf('--unit');
const onlyUnit = unitFlag > -1 ? process.argv[unitFlag + 1] : null;

if (!path) {
  console.error('usage: restore-missing.mjs <extracted.json> [--unit "Unit Title"]');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const data = JSON.parse(readFileSync(path, 'utf8'));
const units = await prisma.unit.findMany({ select: { id: true, title: true } });
const unitByTitle = new Map(units.map((u) => [u.title, u]));

/**
 * Every reference already held, across all units rather than just the one
 * being restored. A question filed under the wrong unit by an earlier run
 * would otherwise be inserted a second time.
 */
const existing = await prisma.question.findMany({ select: { sourceRef: true } });
const held = new Set(existing.map((q) => q.sourceRef).filter(Boolean));

const wanted = data.questions.filter((q) => (onlyUnit ? q.unit === onlyUnit : true));
const missing = wanted.filter((q) => !held.has(q.sourceRef));
const alreadyThere = wanted.length - missing.length;

console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== RESTORE ===\n');
console.log(`questions in source${onlyUnit ? ` for ${onlyUnit}` : ''} : ${wanted.length}`);
console.log(`already in the database              : ${alreadyThere}`);
console.log(`missing, to be restored              : ${missing.length}\n`);

const noUnit = missing.filter((q) => !q.unit || !unitByTitle.has(q.unit));
if (noUnit.length) {
  // Never filed under a guess. If the unit cannot be resolved the run stops,
  // because a question in the wrong unit is harder to find than a missing one.
  console.error(`REFUSING: ${noUnit.length} question(s) name no unit that exists:`);
  for (const q of noUnit) console.error(`  ${q.sourceRef} -> ${JSON.stringify(q.unit)}`);
  await prisma.$disconnect();
  process.exit(1);
}

for (const q of missing) {
  const flagged = q.needsReview || Object.keys(q.answerKey).length === 0;
  console.log(`  ${q.sourceRef}  [${q.unit}]  ${q.type}${flagged ? '  (needs review)' : ''}`);
  console.log(`      ${q.prompt}`);
}

if (DRY) {
  console.log('\n=== DRY RUN — nothing was written ===');
  await prisma.$disconnect();
  process.exit(0);
}

/**
 * Order continues after whatever the unit already holds, so a restored
 * question never collides with a surviving one on `orderIndex`.
 */
const nextOrder = new Map();
for (const unit of units) {
  const top = await prisma.question.aggregate({
    where: { unitId: unit.id },
    _max: { orderIndex: true },
  });
  nextOrder.set(unit.id, (top._max.orderIndex ?? -1) + 1);
}

let created = 0;
let flaggedForReview = 0;

for (const q of missing) {
  const unit = unitByTitle.get(q.unit);
  const order = nextOrder.get(unit.id);
  nextOrder.set(unit.id, order + 1);

  const needsReview = q.needsReview || Object.keys(q.answerKey).length === 0;

  await prisma.question.create({
    data: {
      unitId: unit.id,
      typeKey: q.type,
      prompt: q.prompt,
      payload: q.payload,
      answerKey: q.answerKey,
      orderIndex: order,
      status: 'DRAFT',
      needsReview,
      reviewNotes: q.reviewNotes,
      sourceRef: q.sourceRef,
    },
  });

  created += 1;
  if (needsReview) flaggedForReview += 1;
}

console.log(`\nrestored ${created} question(s), all as drafts.`);
console.log(`  needing a teacher's review : ${flaggedForReview}`);
console.log('\nNothing is visible to students; the units stay unpublished.');

await prisma.$disconnect();
