/**
 * Applies the teacher's curriculum decisions.
 *
 * Every decision lives in `teacher-decisions.json`, which is the record of what
 * she approved; this script only carries them into the database. Nothing here
 * decides anything about the curriculum.
 *
 * Two rules shape the whole script:
 *
 *   1. It checks before it changes. Each decision states what it expects the
 *      current record to look like, and a record that does not match is
 *      reported and skipped rather than forced into shape.
 *   2. It can be run twice. Work already done is recognised and skipped, so a
 *      second run reports "already applied" and writes nothing.
 *
 *   DIRECT_URL=… node apply-teacher-decisions.mjs <activities.json> <file.docx>
 *
 * DRY=1 shows what it would do without writing anything.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '../prisma-client.mjs';

const DRY = process.env.DRY === '1';
const [activitiesPath, docx] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));

if (!activitiesPath || !docx) {
  console.error('usage: apply-teacher-decisions.mjs <activities.json> <file.docx>');
  process.exit(1);
}

const decisions = JSON.parse(readFileSync(join(here, 'teacher-decisions.json'), 'utf8'));
const extracted = JSON.parse(readFileSync(activitiesPath, 'utf8'));

const checksum = execFileSync('md5sum', [docx]).toString().split(' ')[0];
if (checksum !== decisions.sourceChecksum) {
  console.error(
    `REFUSING: this file is ${checksum}, but the decisions were made against ${decisions.sourceChecksum}.`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const applied = [];
const skipped = [];
const problems = [];
const note = (list, what, detail) => list.push(`${what}${detail ? ` — ${detail}` : ''}`);

console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLY TEACHER DECISIONS ===\n');

// ---------------------------------------------------------------------------
// 1. Grammar sheet pairings: all eight confirmed correct as proposed.
//    Only the review flag changes; the scan, the title and the unit stay.
// ---------------------------------------------------------------------------
const units = await prisma.unit.findMany({ select: { id: true, title: true } });
const unitByTitle = new Map(units.map((u) => [u.title, u]));

for (const want of decisions.grammarMappings.expected) {
  const unit = unitByTitle.get(want.unit);
  if (!unit) {
    note(problems, `grammar "${want.title}"`, `unit ${want.unit} does not exist`);
    continue;
  }

  const section = await prisma.unitSection.findFirst({
    where: { unitId: unit.id, typeKey: 'grammar', title: want.title },
    select: { id: true, needsReview: true, media: { select: { id: true } } },
  });

  if (!section) {
    note(problems, `grammar "${want.title}"`, `no section with that title in ${want.unit}`);
    continue;
  }
  if (section.media.length === 0) {
    note(problems, `grammar "${want.title}"`, 'the scan is missing; not touching it');
    continue;
  }
  if (!section.needsReview) {
    note(skipped, `grammar "${want.title}"`, 'already confirmed');
    continue;
  }

  if (!DRY) {
    await prisma.unitSection.update({
      where: { id: section.id },
      // The scan, the title, the unit and the draft status are all untouched.
      data: { needsReview: false, reviewNotes: null },
    });
  }
  note(applied, `grammar "${want.title}"`, `confirmed for ${want.unit}`);
}

// ---------------------------------------------------------------------------
// 2. The eighteen tick-or-cross questions.
//
//    These were never entered, because the source states no answer for any of
//    them. The wording, the pictures and the unit come from the source; only
//    the answer comes from the teacher.
// ---------------------------------------------------------------------------
const bySourceRef = new Map(
  (await prisma.question.findMany({
    select: { id: true, sourceRef: true, unitId: true, prompt: true, typeKey: true,
              payload: true, answerKey: true, needsReview: true },
  })).map((q) => [q.sourceRef, q]),
);

const fromSource = new Map(extracted.questions.map((q) => [q.sourceRef, q]));

/** Re-encodes a picture below the platform's limit, as the other imports do. */
const pictureCache = new Map();
function jpegOf(name) {
  if (pictureCache.has(name)) return pictureCache.get(name);
  const raw = execFileSync('unzip', ['-p', docx, `word/media/${name}`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const jpeg = execFileSync(
    'python3',
    ['-c',
     'import sys,io;from PIL import Image;' +
     'im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB");' +
     'b=io.BytesIO();im.save(b,"JPEG",quality=88,optimize=True,subsampling=0);' +
     'sys.stdout.buffer.write(b.getvalue())'],
    { input: raw, maxBuffer: 64 * 1024 * 1024 },
  );
  pictureCache.set(name, jpeg);
  return jpeg;
}

const orderTop = new Map();
for (const unit of units) {
  const top = await prisma.question.aggregate({
    where: { unitId: unit.id }, _max: { orderIndex: true },
  });
  orderTop.set(unit.id, (top._max.orderIndex ?? -1) + 1);
}

for (const answer of decisions.trueFalse.answers) {
  const source = fromSource.get(answer.ref);

  if (!source) {
    note(problems, `true/false ${answer.ref}`, 'not found in the source extraction');
    continue;
  }
  // The wording in the decision has to be the wording in the file, or the
  // answer may be being attached to a different question than she read.
  if (source.prompt.trim() !== answer.text.trim()) {
    note(problems, `true/false ${answer.ref}`,
         `source reads "${source.prompt}" but the decision names "${answer.text}"`);
    continue;
  }

  const existing = bySourceRef.get(answer.ref);
  if (existing) {
    const settled = existing.answerKey?.correct === answer.correct && !existing.needsReview;
    if (settled) {
      note(skipped, `true/false ${answer.ref}`, 'already applied');
      continue;
    }
    if (!DRY) {
      await prisma.question.update({
        where: { id: existing.id },
        data: { answerKey: { correct: answer.correct }, needsReview: false, reviewNotes: null },
      });
    }
    note(applied, `true/false ${answer.ref}`, `answer set to ${answer.correct}`);
    continue;
  }

  const unit = unitByTitle.get(source.unit);
  if (!unit) {
    note(problems, `true/false ${answer.ref}`, `unit ${source.unit} does not exist`);
    continue;
  }

  if (!DRY) {
    const order = orderTop.get(unit.id);
    orderTop.set(unit.id, order + 1);

    const created = await prisma.question.create({
      data: {
        unitId: unit.id,
        typeKey: 'true_false',
        prompt: source.prompt,
        payload: {},
        answerKey: { correct: answer.correct },
        orderIndex: order,
        status: 'DRAFT',
        needsReview: false,
        reviewNotes: null,
        sourceRef: answer.ref,
        purpose: 'ACTIVITY',
      },
    });

    // Every picture the source pairs with this question, in its own order.
    // Nothing is added where the source has none, and nothing is dropped
    // where the source has two.
    for (const [n, name] of source.images.entries()) {
      const jpeg = jpegOf(name);
      const asset = await prisma.mediaAsset.create({
        data: {
          questionId: created.id, url: '', mimeType: 'image/jpeg',
          altText: null, orderIndex: n, data: jpeg, byteSize: jpeg.length,
        },
      });
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { url: `/api/v1/content/media/${asset.id}` },
      });
    }
  }
  note(applied, `true/false ${answer.ref}`,
       `created in ${source.unit}, answer ${answer.correct}, ${source.images.length} picture(s)`);
}

// ---------------------------------------------------------------------------
// 3. Vocabulary kept exactly as the source writes it.
// ---------------------------------------------------------------------------
for (const want of decisions.vocabulary.keepAsWritten) {
  const unit = unitByTitle.get(want.unit);
  const word = unit
    ? await prisma.vocabularyItem.findFirst({
        where: { unitId: unit.id, wordEn: want.wordEn },
        select: { id: true, meaningAr: true, needsReview: true },
      })
    : null;

  if (!word) {
    note(problems, `word "${want.wordEn}"`, `not found in ${want.unit}`);
    continue;
  }
  if (word.meaningAr !== want.meaningAr) {
    note(problems, `word "${want.wordEn}"`,
         `stored meaning is "${word.meaningAr}" but the decision confirms "${want.meaningAr}"`);
    continue;
  }
  if (!word.needsReview) {
    note(skipped, `word "${want.wordEn}"`, 'already confirmed');
    continue;
  }

  if (!DRY) {
    // The meaning is deliberately not written: it is already what she approved.
    await prisma.vocabularyItem.update({
      where: { id: word.id },
      data: { needsReview: false, reviewNotes: null },
    });
  }
  note(applied, `word "${want.wordEn}"`, `kept as "${want.meaningAr}"`);
}

// ---------------------------------------------------------------------------
// 4. Answers the source did not state.
//
//    Named by the option's text, not its letter, so the answer cannot land on
//    the wrong option if the order ever differs from what she was shown.
// ---------------------------------------------------------------------------
const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

for (const want of decisions.answerKeys.choices) {
  const q = bySourceRef.get(want.ref);
  if (!q) {
    note(problems, `answer ${want.ref}`, 'question not found');
    continue;
  }
  if (!q.prompt.includes(want.expectPrompt)) {
    note(problems, `answer ${want.ref}`,
         `prompt is "${q.prompt}", which does not contain "${want.expectPrompt}"`);
    continue;
  }

  const options = q.payload?.options ?? [];
  const hit = options.filter((o) => sameText(o.text, want.answerText));
  if (hit.length !== 1) {
    note(problems, `answer ${want.ref}`,
         `"${want.answerText}" matches ${hit.length} of the options ${JSON.stringify(options.map((o) => o.text))}`);
    continue;
  }

  if (q.answerKey?.correctOptionId === hit[0].id && !q.needsReview) {
    note(skipped, `answer ${want.ref}`, 'already applied');
    continue;
  }

  if (!DRY) {
    await prisma.question.update({
      where: { id: q.id },
      data: { answerKey: { correctOptionId: hit[0].id }, needsReview: false, reviewNotes: null },
    });
  }
  note(applied, `answer ${want.ref}`, `"${want.answerText}" (option ${hit[0].id})`);
}

// ---------------------------------------------------------------------------
// 5. The two places the source itself is faulty and she supplied the fix.
// ---------------------------------------------------------------------------
for (const want of decisions.sourceCorrections.oddOneOut) {
  const q = bySourceRef.get(want.ref);
  if (!q) {
    note(problems, `odd one out ${want.ref}`, 'question not found');
    continue;
  }
  if (q.typeKey !== 'odd_one_out') {
    note(problems, `odd one out ${want.ref}`, `is a ${q.typeKey}, not an odd_one_out`);
    continue;
  }

  const options = want.options.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
  const correct = options.find((o) => sameText(o.text, want.answerText));
  if (!correct) {
    note(problems, `odd one out ${want.ref}`, `"${want.answerText}" is not among the given options`);
    continue;
  }

  const current = JSON.stringify(q.payload?.options ?? []);
  if (current === JSON.stringify(options) && q.answerKey?.correctOptionId === correct.id && !q.needsReview) {
    note(skipped, `odd one out ${want.ref}`, 'already applied');
    continue;
  }

  if (!DRY) {
    await prisma.question.update({
      where: { id: q.id },
      data: {
        payload: { options },
        answerKey: { correctOptionId: correct.id },
        needsReview: false,
        // Why the stored words differ from the file stays on the record.
        reviewNotes: `Source correction approved by the teacher on ${decisions.approvedOn}. ${want.why}`,
      },
    });
  }
  note(applied, `odd one out ${want.ref}`, `four options, answer "${want.answerText}"`);
}

for (const want of decisions.sourceCorrections.wordOrdering) {
  const q = bySourceRef.get(want.ref);
  if (!q) {
    note(problems, `word ordering ${want.ref}`, 'question not found');
    continue;
  }
  if (q.typeKey !== 'word_ordering') {
    note(problems, `word ordering ${want.ref}`, `is a ${q.typeKey}, not a word_ordering`);
    continue;
  }

  const tokens = want.tokens.map((text, i) => ({ id: `t${i + 1}`, text }));

  // The order is worked out from the sentence she approved, so the stored
  // answer and the sentence cannot drift apart.
  const wanted = want.sentence.replace(/[.?!]$/, '').split(/\s+/);
  const pool = tokens.map((t) => ({ ...t, words: t.text.trim().split(/\s+/) }));
  const order = [];
  let at = 0;
  let ok = true;

  while (at < wanted.length && pool.length) {
    const byLength = pool.map((t, idx) => ({ t, idx })).sort((a, b) => b.t.words.length - a.t.words.length);
    const hit = byLength.find(({ t }) =>
      t.words.every((w, k) =>
        wanted[at + k] !== undefined &&
        w.replace(/[’']/g, "'").replace(/[.?!,]/g, '').toLowerCase() ===
          wanted[at + k].replace(/[’']/g, "'").replace(/[.?!,]/g, '').toLowerCase()),
    );
    if (!hit) { ok = false; break; }
    order.push(hit.t.id);
    at += hit.t.words.length;
    pool.splice(hit.idx, 1);
  }

  if (!ok || pool.length || at < wanted.length) {
    note(problems, `word ordering ${want.ref}`,
         `the approved words do not build "${want.sentence}" exactly; not changing it`);
    continue;
  }

  const same = JSON.stringify(q.payload?.tokens ?? []) === JSON.stringify(tokens) &&
               JSON.stringify(q.answerKey?.order ?? []) === JSON.stringify(order);
  if (same && !q.needsReview) {
    note(skipped, `word ordering ${want.ref}`, 'already applied');
    continue;
  }

  if (!DRY) {
    await prisma.question.update({
      where: { id: q.id },
      data: {
        payload: { tokens },
        answerKey: { order },
        needsReview: false,
        reviewNotes: `Source correction approved by the teacher on ${decisions.approvedOn}. ${want.why}`,
      },
    });
  }
  note(applied, `word ordering ${want.ref}`, `${tokens.length} words, "${want.sentence}"`);
}

// ---------------------------------------------------------------------------
console.log(`applied : ${applied.length}`);
for (const x of applied) console.log(`   + ${x}`);
console.log(`\nalready done : ${skipped.length}`);
for (const x of skipped) console.log(`   = ${x}`);
console.log(`\ncould not reconcile : ${problems.length}`);
for (const x of problems) console.log(`   ! ${x}`);

console.log(`\ntotal decisions carried : ${applied.length + skipped.length} of 34`);
if (DRY) console.log('\n=== DRY RUN — nothing was written ===');

await prisma.$disconnect();
process.exit(problems.length === 0 ? 0 : 1);
