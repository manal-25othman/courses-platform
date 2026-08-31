/**
 * Reads the bilingual vocabulary tables out of the TOP GOAL Word file.
 *
 * Each unit opens with a table laid out `Arabic | English | Arabic | English`,
 * so every English word carries the Arabic meaning the author wrote beside it.
 * Nothing here translates, completes or corrects: a pair is taken exactly as
 * the two cells state it, and anything that does not read as a clean pair is
 * flagged for a teacher rather than repaired.
 *
 * These tables are ordinary inline body content, which is why they can also be
 * trusted for ordering — see the note on floating headings in `extract.mjs`.
 *
 *   node extract-vocabulary.mjs <file.docx> > vocabulary.json
 */
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('usage: extract-vocabulary.mjs <file.docx>');
  process.exit(1);
}

const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], {
  maxBuffer: 256 * 1024 * 1024,
}).toString('utf8');

const unescape = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/**
 * The text of a chunk of the document.
 *
 * The space after `w:t` is load-bearing. `<w:t[^>]*>` also matches `<w:tbl>`,
 * `<w:tc>`, `<w:tr>` and `<w:tabs>`, and the lazy capture that follows then
 * swallows everything up to the first real `</w:t>` — which is markup, not
 * words. Requiring either `>` or whitespace next keeps it to actual text runs.
 */
const textOf = (chunk) =>
  unescape([...chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''))
    .replace(/\s+/g, ' ')
    .trim();

const UNIT_TITLES = ['Welcome', 'Living Things', 'Lifestyles', 'Interests', 'Professions', 'Grammar Review'];
/** Arabic and Arabic Supplement blocks. */
const ARABIC = /[؀-ۿݐ-ݿ]/;

const paragraphs = xml.split('</w:p>');

/** Unit headings, used only to name a table, never to order anything. */
const headings = [];
paragraphs.forEach((chunk, index) => {
  const t = textOf(chunk);
  const title = UNIT_TITLES.find((u) => t === u || t === `${u} Unit`);
  if (title) headings.push({ index, title });
});

/**
 * Each bilingual table, found by its `Arabic`/`English` header row.
 *
 * Splitting on cell and row ends keeps the table's shape, which is the whole
 * point: a word means nothing without knowing which cell sat beside it.
 */
const tables = [];
for (const chunk of xml.split('</w:tbl>')) {
  const start = chunk.lastIndexOf('<w:tbl>');
  if (start === -1) continue;
  const body = chunk.slice(start);

  const rows = body
    .split('</w:tr>')
    .slice(0, -1)
    .map((row) => row.split('</w:tc>').slice(0, -1).map(textOf));

  if (!rows.length) continue;
  const header = rows[0].map((c) => c.toLowerCase());
  if (!(header.includes('arabic') && header.includes('english'))) continue;

  const before = xml.slice(0, xml.indexOf(body));
  tables.push({
    paragraphIndex: before.split('</w:p>').length - 1,
    header: rows[0],
    rows: rows.slice(1),
  });
}

const words = [];
const flags = [];

for (const table of tables) {
  const nearest = headings.reduce(
    (best, h) =>
      Math.abs(h.index - table.paragraphIndex) < Math.abs(best.index - table.paragraphIndex)
        ? h
        : best,
    headings[0],
  );
  const unit = nearest?.title ?? null;

  // The header names each column, so the pairs are read from it rather than
  // from an assumed order.
  const pairs = [];
  for (let c = 0; c + 1 < table.header.length; c += 2) {
    const left = table.header[c].toLowerCase();
    const right = table.header[c + 1].toLowerCase();
    if (left === 'arabic' && right === 'english') pairs.push({ ar: c, en: c + 1 });
    else if (left === 'english' && right === 'arabic') pairs.push({ ar: c + 1, en: c });
  }

  for (const row of table.rows) {
    for (const { ar, en } of pairs) {
      const meaningAr = (row[ar] ?? '').trim();
      const wordEn = (row[en] ?? '').trim();
      if (!meaningAr && !wordEn) continue;

      if (!wordEn || !meaningAr) {
        flags.push({
          reason: 'incomplete pair',
          unit,
          detail: `one side is empty: English ${JSON.stringify(wordEn)}, Arabic ${JSON.stringify(meaningAr)}`,
        });
        continue;
      }

      // Kept, because it is what the file says — but a meaning written in
      // something other than Arabic script is not what the column promises,
      // so a teacher is asked rather than the value being changed.
      const arabicScript = ARABIC.test(meaningAr);

      words.push({
        unit,
        wordEn,
        meaningAr,
        needsReview: !arabicScript,
        reviewNotes: arabicScript
          ? null
          : `The source gives the meaning as ${JSON.stringify(meaningAr)}, which is not Arabic script. Stored exactly as written; please confirm the meaning to show.`,
      });
    }
  }
}

/** The same word twice inside one unit is the file repeating itself. */
const seen = new Set();
const unique = [];
let duplicatesDropped = 0;
for (const w of words) {
  const key = `${w.unit} ${w.wordEn.toLowerCase()}`;
  if (seen.has(key)) {
    duplicatesDropped += 1;
    flags.push({ reason: 'repeated word', unit: w.unit, detail: `"${w.wordEn}" appears more than once` });
    continue;
  }
  seen.add(key);
  unique.push(w);
}

const byUnit = unique.reduce(
  (acc, w) => ({ ...acc, [w.unit ?? '(none)']: (acc[w.unit ?? '(none)'] ?? 0) + 1 }),
  {},
);

console.log(
  JSON.stringify(
    {
      source: file.split('/').pop(),
      extractedAt: new Date().toISOString(),
      words: unique,
      flags,
      summary: {
        total: unique.length,
        byUnit,
        needingReview: unique.filter((w) => w.needsReview).length,
        duplicatesDropped,
        tablesFound: tables.length,
      },
    },
    null,
    2,
  ),
);
