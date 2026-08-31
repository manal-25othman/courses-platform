/**
 * Moves questions that were filed under the wrong unit.
 *
 * The extractor used to attribute a question to the last unit heading above
 * it, which is unreliable when the headings are floating text boxes (see
 * `extract.mjs`). Seven Professions questions ended up under Grammar Review.
 * `extract.mjs` no longer does that; this moves the rows it already wrote.
 *
 * Only the unit changes. Prompt, payload, answer key, review flags, status,
 * purpose and `source_ref` are all left exactly as they are, and a question is
 * moved only when the freshly extracted file disagrees with the database about
 * its unit — never on a title or a hard-coded list.
 *
 *   DIRECT_URL=… node refile-questions.mjs <extracted.json>
 *
 * DRY=1 lists the moves without making them.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../prisma-client.mjs';

const DRY = process.env.DRY === '1';
const path = process.argv[2];

if (!path) {
  console.error('usage: refile-questions.mjs <extracted.json>');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const data = JSON.parse(readFileSync(path, 'utf8'));
const units = await prisma.unit.findMany({ select: { id: true, title: true } });
const unitByTitle = new Map(units.map((u) => [u.title, u]));
const titleById = new Map(units.map((u) => [u.id, u.title]));

const rows = await prisma.question.findMany({
  where: { sourceRef: { not: null } },
  select: { id: true, sourceRef: true, unitId: true, prompt: true },
});
const bySourceRef = new Map(rows.map((r) => [r.sourceRef, r]));

const moves = [];
for (const q of data.questions) {
  const row = bySourceRef.get(q.sourceRef);
  if (!row || !q.unit) continue;
  const now = titleById.get(row.unitId);
  if (now !== q.unit) moves.push({ row, from: now, to: q.unit });
}

console.log(DRY ? '=== DRY RUN — nothing will change ===\n' : '=== REFILE ===\n');
console.log(`questions checked : ${bySourceRef.size}`);
console.log(`to move           : ${moves.length}\n`);

for (const m of moves) {
  console.log(`  ${m.row.sourceRef}  ${m.from} -> ${m.to}`);
  console.log(`      ${m.row.prompt.slice(0, 70)}`);
}

const unknown = moves.filter((m) => !unitByTitle.has(m.to));
if (unknown.length) {
  console.error(`\nREFUSING: ${unknown.length} move(s) name a unit that does not exist.`);
  await prisma.$disconnect();
  process.exit(1);
}

if (DRY || moves.length === 0) {
  console.log(DRY ? '\n=== DRY RUN — nothing changed ===' : '\nNothing to move.');
  await prisma.$disconnect();
  process.exit(0);
}

/**
 * Order continues after what the destination already holds, so a moved
 * question cannot collide with one already there on `(unit, order_index)`.
 */
for (const m of moves) {
  const unit = unitByTitle.get(m.to);
  const top = await prisma.question.aggregate({
    where: { unitId: unit.id },
    _max: { orderIndex: true },
  });
  await prisma.question.update({
    where: { id: m.row.id },
    data: { unitId: unit.id, orderIndex: (top._max.orderIndex ?? -1) + 1 },
  });
}

console.log(`\nmoved ${moves.length} question(s). Nothing else about them changed.`);
await prisma.$disconnect();
