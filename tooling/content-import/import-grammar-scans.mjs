/**
 * Prepares the grammar teaching scans as grammar sections.
 *
 * The eight sheets at the end of the source are the densest teaching material
 * in the file — bilingual explanation, rules, worked examples, common
 * mistakes, exercises — and all of it is picture, not text. Nothing here
 * rewrites or summarises them: each becomes a grammar section whose teaching
 * content *is* the scan, attached as its picture.
 *
 * Every section is created DRAFT and marked for review, because the document
 * contradicts itself about which unit each sheet belongs to (see
 * `grammar-scans.json`). The mapping follows the sheets' own worked examples;
 * a teacher confirms it against the printed pages.
 *
 * Needs `python3` with Pillow, used only to re-encode each scan below the
 * platform's 2 MB picture limit so a teacher can also replace one through the
 * normal upload screen. Resolution is unchanged.
 *
 *   DIRECT_URL=… node import-grammar-scans.mjs <file.docx>
 *
 * DRY=1 shows what would be written without writing anything.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '../prisma-client.mjs';

const DRY = process.env.DRY === '1';
const docx = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));

if (!docx) {
  console.error('usage: import-grammar-scans.mjs <file.docx>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(here, 'grammar-scans.json'), 'utf8'));

/** Refuse a file that is not the one the mapping was read from. */
const checksum = execFileSync('md5sum', [docx]).toString().split(' ')[0];
if (checksum !== manifest.sourceChecksum) {
  console.error(
    `REFUSING: this file is ${checksum}, but the mapping in grammar-scans.json was read from ${manifest.sourceChecksum}.\n` +
      'The image names and the unit mapping are only meaningful for that exact file.',
  );
  process.exit(1);
}

/** Re-encode one scan below the picture limit, keeping its resolution. */
function jpegOf(imageName) {
  const png = execFileSync('unzip', ['-p', docx, `word/media/${imageName}`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return execFileSync(
    'python3',
    [
      '-c',
      'import sys,io;from PIL import Image;' +
        'im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB");' +
        'b=io.BytesIO();im.save(b,"JPEG",quality=88,optimize=True,subsampling=0);' +
        'sys.stdout.buffer.write(b.getvalue())',
    ],
    { input: png, maxBuffer: 64 * 1024 * 1024 },
  );
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const units = await prisma.unit.findMany({ select: { id: true, title: true } });
const unitByTitle = new Map(units.map((u) => [u.title, u]));

const unknown = manifest.scans.filter((s) => !unitByTitle.has(s.unit));
if (unknown.length) {
  console.error(`REFUSING: these units do not exist: ${unknown.map((s) => s.unit).join(', ')}`);
  await prisma.$disconnect();
  process.exit(1);
}

/**
 * A scan already loaded is left alone. Identified by its section title within
 * the unit, which is what a re-run would otherwise duplicate.
 */
const existing = await prisma.unitSection.findMany({
  where: { typeKey: 'grammar' },
  select: { unitId: true, title: true },
});
const held = new Set(existing.map((s) => `${s.unitId} ${s.title}`));

const toWrite = manifest.scans.filter((s) => !held.has(`${unitByTitle.get(s.unit).id} ${s.title}`));

console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== IMPORT GRAMMAR SCANS ===\n');
console.log(`scans in manifest      : ${manifest.scans.length}`);
console.log(`already in the database: ${manifest.scans.length - toWrite.length}`);
console.log(`to write               : ${toWrite.length}\n`);
for (const s of toWrite) console.log(`  ${s.unit.padEnd(15)} ${s.image}  "${s.title}"`);

if (DRY || toWrite.length === 0) {
  console.log(DRY ? '\n=== DRY RUN — nothing was written ===' : '\nNothing to write.');
  await prisma.$disconnect();
  process.exit(0);
}

const REVIEW_NOTE =
  'The unit this sheet belongs to was read from its own worked examples, because the ' +
  "source document's headings group the eight sheets differently and its images are " +
  'floating anchors whose file order is not their page order. Please confirm against the ' +
  'printed pages before publishing.';

const nextOrder = new Map();
for (const unit of units) {
  const top = await prisma.unitSection.aggregate({
    where: { unitId: unit.id },
    _max: { orderIndex: true },
  });
  nextOrder.set(unit.id, (top._max.orderIndex ?? -1) + 1);
}

let created = 0;
for (const scan of toWrite) {
  const unit = unitByTitle.get(scan.unit);
  const order = nextOrder.get(unit.id);
  nextOrder.set(unit.id, order + 1);

  const jpeg = jpegOf(scan.image);

  const section = await prisma.unitSection.create({
    data: {
      unitId: unit.id,
      typeKey: 'grammar',
      orderIndex: order,
      title: scan.title,
      // Left empty on purpose: the teaching content is the sheet itself, and
      // nothing here rewrites it.
      body: null,
      status: 'DRAFT',
      needsReview: true,
      reviewNotes: REVIEW_NOTE,
    },
  });

  const asset = await prisma.mediaAsset.create({
    data: {
      sectionId: section.id,
      url: '',
      mimeType: 'image/jpeg',
      altText: `Grammar sheet: ${scan.title}`,
      orderIndex: 0,
      data: jpeg,
      byteSize: jpeg.length,
    },
  });
  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { url: `/api/v1/content/media/${asset.id}` },
  });

  console.log(`  wrote ${scan.unit} / "${scan.title}"  (${Math.round(jpeg.length / 1024)} KB)`);
  created += 1;
}

console.log(`\nprepared ${created} grammar section(s), all drafts, all marked for review.`);
console.log('Nothing is visible to students; the units stay unpublished.');

await prisma.$disconnect();
