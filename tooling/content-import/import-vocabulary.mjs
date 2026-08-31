/**
 * Loads extracted vocabulary into the database.
 *
 * Everything arrives as a DRAFT and nothing becomes visible to students on its
 * own. A pair the extractor could not read as plain Arabic is stored exactly
 * as the source wrote it and marked for review, so a teacher decides rather
 * than the import guessing.
 *
 * Words are identified by `(unit, wordEn)`, which the database already holds
 * unique. A word already present is left alone — never overwritten — so this
 * can be re-run safely and a teacher's correction is never undone by a second
 * import.
 *
 *   DIRECT_URL=… node import-vocabulary.mjs <vocabulary.json>
 *
 * DRY=1 shows what would be written without writing anything.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../prisma-client.mjs';

const DRY = process.env.DRY === '1';
const path = process.argv[2];

if (!path) {
  console.error('usage: import-vocabulary.mjs <vocabulary.json>');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const data = JSON.parse(readFileSync(path, 'utf8'));
const units = await prisma.unit.findMany({ select: { id: true, title: true } });
const unitByTitle = new Map(units.map((u) => [u.title, u]));

const unknownUnits = [...new Set(data.words.map((w) => w.unit))].filter(
  (t) => !t || !unitByTitle.has(t),
);
if (unknownUnits.length) {
  // Never filed under a guess.
  console.error(`REFUSING: these units do not exist: ${JSON.stringify(unknownUnits)}`);
  await prisma.$disconnect();
  process.exit(1);
}

const existing = await prisma.vocabularyItem.findMany({
  select: { unitId: true, wordEn: true },
});
const held = new Set(existing.map((w) => `${w.unitId} ${w.wordEn}`));

const toWrite = data.words.filter((w) => !held.has(`${unitByTitle.get(w.unit).id} ${w.wordEn}`));
const alreadyThere = data.words.length - toWrite.length;

console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== IMPORT VOCABULARY ===\n');
console.log(`words in source        : ${data.words.length}`);
console.log(`already in the database: ${alreadyThere}`);
console.log(`to write               : ${toWrite.length}`);
console.log(`of those, for review   : ${toWrite.filter((w) => w.needsReview).length}\n`);

for (const w of toWrite.filter((x) => x.needsReview)) {
  console.log(`  review  [${w.unit}] ${w.wordEn} = ${w.meaningAr}`);
}

if (DRY || toWrite.length === 0) {
  console.log(DRY ? '\n=== DRY RUN — nothing was written ===' : '\nNothing to write.');
  await prisma.$disconnect();
  process.exit(0);
}

/** Order continues after whatever each unit already holds. */
const nextOrder = new Map();
for (const unit of units) {
  const top = await prisma.vocabularyItem.aggregate({
    where: { unitId: unit.id },
    _max: { orderIndex: true },
  });
  nextOrder.set(unit.id, (top._max.orderIndex ?? -1) + 1);
}

let created = 0;
for (const w of toWrite) {
  const unit = unitByTitle.get(w.unit);
  const order = nextOrder.get(unit.id);
  nextOrder.set(unit.id, order + 1);

  await prisma.vocabularyItem.create({
    data: {
      unitId: unit.id,
      wordEn: w.wordEn,
      meaningAr: w.meaningAr,
      orderIndex: order,
      status: 'DRAFT',
      needsReview: w.needsReview,
      reviewNotes: w.reviewNotes,
    },
  });
  created += 1;
}

const byUnit = {};
for (const w of toWrite) byUnit[w.unit] = (byUnit[w.unit] ?? 0) + 1;

console.log(`wrote ${created} word(s), all as drafts:`);
for (const [unit, n] of Object.entries(byUnit)) console.log(`  ${unit.padEnd(16)} ${n}`);
console.log('\nNothing is visible to students; the units stay unpublished.');

await prisma.$disconnect();
