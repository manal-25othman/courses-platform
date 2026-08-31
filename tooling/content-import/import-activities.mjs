/**
 * Loads the table-based exercises into the database.
 *
 * Same rules as every other import here: everything is a DRAFT, a question is
 * identified by its `source_ref` so a second run writes nothing, and a
 * question whose answer the source does not state is stored with no answer key
 * and marked for a teacher rather than filled in with a guess.
 *
 * Pictures come with the questions that need them — a spelling or
 * picture-matching question without its picture is unanswerable — and are
 * re-encoded below the platform's picture limit, as the grammar scans are.
 *
 *   DIRECT_URL=… node import-activities.mjs <activities.json> <file.docx>
 *
 * DRY=1 shows what would be written without writing anything.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../prisma-client.mjs';

const DRY = process.env.DRY === '1';
const [path, docx] = process.argv.slice(2);

if (!path || !docx) {
  console.error('usage: import-activities.mjs <activities.json> <file.docx>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(path, 'utf8'));

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const units = await prisma.unit.findMany({ select: { id: true, title: true } });
const unitByTitle = new Map(units.map((u) => [u.title, u]));

const unknown = [...new Set(data.questions.map((q) => q.unit))].filter((t) => !unitByTitle.has(t));
if (unknown.length) {
  console.error(`REFUSING: these units do not exist: ${JSON.stringify(unknown)}`);
  await prisma.$disconnect();
  process.exit(1);
}

const existing = await prisma.question.findMany({ select: { sourceRef: true } });
const held = new Set(existing.map((q) => q.sourceRef).filter(Boolean));

const toWrite = data.questions.filter((q) => !held.has(q.sourceRef));

console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== IMPORT ACTIVITIES ===\n');
console.log(`questions in source    : ${data.questions.length}`);
console.log(`already in the database: ${data.questions.length - toWrite.length}`);
console.log(`to write               : ${toWrite.length}`);
console.log(`of those, for review   : ${toWrite.filter((q) => q.needsReview).length}`);
console.log(`of those, with picture : ${toWrite.filter((q) => q.images.length).length}\n`);

const byUnit = {};
for (const q of toWrite) {
  byUnit[q.unit] ??= {};
  byUnit[q.unit][q.type] = (byUnit[q.unit][q.type] ?? 0) + 1;
}
for (const [unit, types] of Object.entries(byUnit)) {
  console.log(`  ${unit.padEnd(15)} ${JSON.stringify(types)}`);
}

if (DRY || toWrite.length === 0) {
  console.log(DRY ? '\n=== DRY RUN — nothing was written ===' : '\nNothing to write.');
  await prisma.$disconnect();
  process.exit(0);
}

/** Re-encode a picture below the platform's limit, keeping its resolution. */
const cache = new Map();
function jpegOf(name) {
  if (cache.has(name)) return cache.get(name);
  const raw = execFileSync('unzip', ['-p', docx, `word/media/${name}`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const jpeg = execFileSync(
    'python3',
    [
      '-c',
      'import sys,io;from PIL import Image;' +
        'im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB");' +
        'b=io.BytesIO();im.save(b,"JPEG",quality=88,optimize=True,subsampling=0);' +
        'sys.stdout.buffer.write(b.getvalue())',
    ],
    { input: raw, maxBuffer: 64 * 1024 * 1024 },
  );
  cache.set(name, jpeg);
  return jpeg;
}

const nextOrder = new Map();
for (const unit of units) {
  const top = await prisma.question.aggregate({
    where: { unitId: unit.id },
    _max: { orderIndex: true },
  });
  nextOrder.set(unit.id, (top._max.orderIndex ?? -1) + 1);
}

let created = 0;
let pictures = 0;

for (const q of toWrite) {
  const unit = unitByTitle.get(q.unit);
  const order = nextOrder.get(unit.id);
  nextOrder.set(unit.id, order + 1);

  const question = await prisma.question.create({
    data: {
      unitId: unit.id,
      typeKey: q.type,
      prompt: q.prompt,
      payload: q.payload,
      answerKey: q.answerKey,
      orderIndex: order,
      status: 'DRAFT',
      needsReview: q.needsReview,
      reviewNotes: q.reviewNotes,
      sourceRef: q.sourceRef,
    },
  });

  for (const [n, name] of q.images.entries()) {
    const jpeg = jpegOf(name);
    const asset = await prisma.mediaAsset.create({
      data: {
        questionId: question.id,
        url: '',
        mimeType: 'image/jpeg',
        altText: null,
        orderIndex: n,
        data: jpeg,
        byteSize: jpeg.length,
      },
    });
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { url: `/api/v1/content/media/${asset.id}` },
    });
    pictures += 1;
  }

  created += 1;
}

console.log(`\nwrote ${created} question(s) and ${pictures} picture(s), all as drafts.`);
console.log('Nothing is visible to students; the units stay unpublished.');

await prisma.$disconnect();
