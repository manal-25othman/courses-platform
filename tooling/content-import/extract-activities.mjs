/**
 * Reads the exercises the first extractor would not guess at.
 *
 * `extract.mjs` takes only what it can read as plain text: a numbered stem
 * with lettered options, and an answer marked by highlighting. That leaves the
 * exercises whose structure is the table they sit in — matching, ordering,
 * spelling under a picture, missing letters. Their answers are in the file;
 * they are in a cell, not a sentence, so reading them means keeping the shape
 * of the table rather than flattening it.
 *
 * The rule is unchanged: nothing is invented. Every answer here is one the
 * source states, in a cell or on the line below. The single exception is the
 * missing-letter exercise, where the source gives the choices but not the
 * answer — and there the word is completed only if exactly one choice makes a
 * word that appears in this document's own vocabulary. Anything ambiguous is
 * flagged for a teacher instead.
 *
 *   node extract-activities.mjs <file.docx> > activities.json
 */
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('usage: extract-activities.mjs <file.docx>');
  process.exit(1);
}

const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], {
  maxBuffer: 256 * 1024 * 1024,
}).toString('utf8');

const rels = {};
for (const m of execFileSync('unzip', ['-p', file, 'word/_rels/document.xml.rels'])
  .toString('utf8')
  .matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
  rels[m[1]] = m[2].split('/').pop();
}

const unescape = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** See the note in extract-vocabulary.mjs: the space after `w:t` is required. */
const textOf = (chunk) =>
  unescape([...chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''))
    .replace(/\s+/g, ' ')
    .trim();

const imagesOf = (chunk) =>
  [...chunk.matchAll(/r:embed="([^"]+)"/g)].map((m) => rels[m[1]]).filter(Boolean);

const UNIT_TITLES = ['Welcome', 'Living Things', 'Lifestyles', 'Interests', 'Professions', 'Grammar Review'];

const paragraphs = xml.split('</w:p>');
const paraText = paragraphs.map(textOf);

/**
 * The paragraphs, broken into the lines a reader would see.
 *
 * Inside a text box Word writes a line break as `w:br` rather than starting a
 * new paragraph, so several numbered questions arrive welded into one string.
 * Scanning paragraphs alone therefore missed every exercise in the Interests
 * and Professions grammar boxes. Each line keeps the index of the paragraph it
 * came from, so a reference back into the document is still exact.
 */
const lines = [];
paragraphs.forEach((chunk, index) => {
  const parts = chunk
    .replace(/<w:br\s*\/?>/g, '\u0000')
    .split('\u0000')
    .map((part) => textOf(part));

  parts.forEach((text, n) => lines.push({ text, index, line: n }));
});

/** Unit headings, used only to name a band, never to order anything. */
const headings = [];
paraText.forEach((t, index) => {
  const title = UNIT_TITLES.find((u) => t === u || t === `${u} Unit`);
  if (title) headings.push({ index, title });
});

// --- tables, with their shape kept --------------------------------------
const tables = [];
for (const chunk of xml.split('</w:tbl>')) {
  const start = chunk.lastIndexOf('<w:tbl>');
  if (start === -1) continue;
  const body = chunk.slice(start);

  const rows = body
    .split('</w:tr>')
    .slice(0, -1)
    .map((row) =>
      row
        .split('</w:tc>')
        .slice(0, -1)
        .map((cell) => ({ text: textOf(cell), images: imagesOf(cell) })),
    );

  if (!rows.length) continue;
  const before = xml.slice(0, xml.indexOf(body));
  tables.push({ paragraphIndex: before.split('</w:p>').length - 1, rows });
}

/** Unit bands, taken from the inline vocabulary tables (see extract.mjs). */
const bandStarts = tables
  .filter((t) => {
    const head = t.rows[0].map((c) => c.text.toLowerCase());
    return head.includes('arabic') && head.includes('english');
  })
  .map((t) => t.paragraphIndex);

const bands = bandStarts.map((start, i) => {
  const nearest = headings.reduce(
    (best, h) => (Math.abs(h.index - start) < Math.abs(best.index - start) ? h : best),
    headings[0],
  );
  return { unit: nearest?.title ?? null, start, end: bandStarts[i + 1] ?? Infinity };
});

const unitAt = (position) => bands.find((b) => position >= b.start && position < b.end)?.unit ?? null;

/** Every English word the document itself defines, for the letter puzzles. */
const vocabulary = new Set();
for (const t of tables) {
  const head = t.rows[0].map((c) => c.text.toLowerCase());
  if (!(head.includes('arabic') && head.includes('english'))) continue;
  const cols = [];
  for (let c = 0; c + 1 < head.length; c += 2) {
    if (head[c] === 'arabic') cols.push(c + 1);
    else if (head[c + 1] === 'arabic') cols.push(c);
  }
  for (const row of t.rows.slice(1)) {
    for (const c of cols) {
      const w = (row[c]?.text ?? '').trim().toLowerCase();
      if (w) vocabulary.add(w);
    }
  }
}

const questions = [];
const flags = [];
const flag = (reason, detail, unit) => flags.push({ reason, detail, unit });

const stripNumber = (s) => s.replace(/^\s*\d+\s*[-).]\s*/, '').trim();

// -----------------------------------------------------------------------
// 1. Matching. The middle column holds the number of the stem each answer
//    belongs to, so the pairing is stated rather than inferred.
// -----------------------------------------------------------------------
for (const t of tables) {
  if (t.rows.length < 3) continue;
  const looksMatching = t.rows.every((r) => r.length === 3 && /^\d+$/.test(r[1].text.trim()));
  if (!looksMatching) continue;

  const unit = unitAt(t.paragraphIndex);
  const stems = t.rows.map((r) => stripNumber(r[0].text));
  const answers = t.rows.map((r) => r[2].text.trim());
  const numbers = t.rows.map((r) => Number(r[1].text.trim()));

  if (stems.some((s) => !s) || answers.some((a) => !a)) {
    flag('matching incomplete', 'a stem or an answer cell is empty', unit);
    continue;
  }

  const left = stems.map((text, i) => ({ id: `l${i + 1}`, text }));
  const right = answers.map((text, i) => ({ id: `r${i + 1}`, text }));

  const pairs = {};
  let usable = true;
  numbers.forEach((stemNumber, answerIndex) => {
    if (!Number.isInteger(stemNumber) || stemNumber < 1 || stemNumber > stems.length) {
      usable = false;
      return;
    }
    pairs[`l${stemNumber}`] = `r${answerIndex + 1}`;
  });

  if (!usable || Object.keys(pairs).length !== stems.length) {
    flag('matching numbers unusable', 'the answer numbers do not cover every stem once', unit);
    continue;
  }

  questions.push({
    type: 'matching',
    unit,
    prompt: 'Match the correct answer.',
    payload: { left, right },
    answerKey: { pairs },
    sourceRef: `p${t.paragraphIndex}-match`,
    needsReview: false,
    reviewNotes: null,
    images: [],
  });
}

// -----------------------------------------------------------------------
// 2. Tables of a picture with a word under it.
//
//    Three shapes, one layout: scrambled letters, the picture, the answer.
//    Which kind it is comes from the instruction in the first row.
// -----------------------------------------------------------------------
const handledTables = new Set();

const PICTURE_TABLES = [
  { re: /write the correct spelling under each picture/i, type: 'spelling' },
  { re: /write the correct word under its picture/i, type: 'picture_word' },
];

for (const t of tables) {
  const heading = t.rows[0].map((c) => c.text).join(' ');
  let kind = PICTURE_TABLES.find((k) => k.re.test(heading));

  /**
   * One of these tables is labelled as picture matching but laid out as
   * scrambled letters over a picture over the answer. The layout is what the
   * exercise actually is, so the shape decides when the label does not fit:
   * a row of pictures with a row of plain words under it.
   */
  if (!kind) {
    const pictureAt = t.rows.findIndex((r) => r.some((c) => c.images.length));
    const under = pictureAt >= 0 ? t.rows[pictureAt + 1] : undefined;
    const plainWords =
      under &&
      under.length === t.rows[pictureAt].length &&
      under.every((c) => /^[a-z][a-z' -]*$/i.test(c.text.trim()));
    if (plainWords) kind = { type: 'spelling' };
  }

  if (!kind) continue;
  handledTables.add(t);

  const unit = unitAt(t.paragraphIndex);

  /**
   * The three rows are found by where they sit, not by what they contain.
   *
   * Searching for "a row with letters and no pictures" matched the
   * instruction row at the top of the table, so the scrambled letters were
   * read from the heading and every question but one lost its clue. The
   * layout is fixed — scrambled letters, then the pictures, then the answers —
   * so position is what identifies them, and the row widths have to agree.
   */
  const pictureAt = t.rows.findIndex((r) => r.some((c) => c.images.length));
  const pictures = pictureAt >= 0 ? t.rows[pictureAt] : undefined;
  const scrambled = pictureAt > 0 ? t.rows[pictureAt - 1] : undefined;
  const answers = pictureAt >= 0 ? t.rows[pictureAt + 1] : undefined;

  if (
    !scrambled ||
    !pictures ||
    !answers ||
    scrambled.length !== pictures.length ||
    answers.length !== pictures.length
  ) {
    flag(
      `${kind.type} table unreadable`,
      'the scrambled, picture and answer rows are not three rows of equal width',
      unit,
    );
    continue;
  }

  for (let c = 0; c < pictures.length; c += 1) {
    const answer = (answers[c]?.text ?? '').trim();
    const image = pictures[c]?.images[0];
    const clue = stripNumber(scrambled[c]?.text ?? '');

    if (!answer || !image) {
      flag(`${kind.type} column incomplete`, `column ${c + 1} has no answer or no picture`, unit);
      continue;
    }

    questions.push({
      type: kind.type,
      unit,
      prompt:
        kind.type === 'spelling'
          ? `Write the correct spelling: ${clue}`
          : 'Write the correct word for this picture.',
      payload: {},
      answerKey: { accepted: [answer] },
      sourceRef: `p${t.paragraphIndex}-${kind.type}-${c + 1}`,
      needsReview: false,
      reviewNotes: null,
      images: [image],
    });
  }
}

// -----------------------------------------------------------------------
// 3. Match the picture with the correct word.
//
//    A numbered list of words, and under each picture the number of the word
//    it shows. Each picture becomes one question whose options are the words.
// -----------------------------------------------------------------------
for (const t of tables) {
  const heading = t.rows[0].map((c) => c.text).join(' ');
  if (!/match the picture with the correct word/i.test(heading)) continue;
  // One table carries this instruction but is laid out as scrambled letters
  // over a picture over the answer, and was already read that way.
  if (handledTables.has(t)) continue;

  const unit = unitAt(t.paragraphIndex);
  const wordRow = t.rows.find((r) => r.length > 2 && r.every((c) => /^\s*\d+\s*-/.test(c.text)));
  const pictureRow = t.rows.find((r) => r.some((c) => c.images.length));

  if (!wordRow || !pictureRow) {
    flag('picture matching unreadable', 'could not find the word list or the pictures', unit);
    continue;
  }

  // "6- tired" gives both the number and the word.
  const words = new Map();
  for (const cell of wordRow) {
    const m = cell.text.match(/^\s*(\d+)\s*-\s*(.+)$/);
    if (m) words.set(Number(m[1]), m[2].trim());
  }

  const options = [...words.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, text]) => ({ id: `o${n}`, text }));

  for (let c = 0; c < pictureRow.length; c += 1) {
    const cell = pictureRow[c];
    if (!cell.images.length) continue;

    // The answer is the number written in the same cell as the picture.
    const m = cell.text.match(/(\d+)/);
    if (!m) {
      flag('picture matching answer missing', `picture ${c + 1} has no number beside it`, unit);
      continue;
    }
    const n = Number(m[1]);
    if (!words.has(n)) {
      flag('picture matching answer unknown', `picture ${c + 1} names word ${n}, which is not listed`, unit);
      continue;
    }

    questions.push({
      type: 'picture_matching',
      unit,
      prompt: 'Match the picture with the correct word.',
      payload: { options },
      answerKey: { correctOptionId: `o${n}` },
      sourceRef: `p${t.paragraphIndex}-picmatch-${c + 1}`,
      needsReview: false,
      reviewNotes: null,
      images: [cell.images[0]],
    });
  }
}

// -----------------------------------------------------------------------
// 4. Missing letter.
//
//    The source gives the choices but never marks the answer. A choice is
//    accepted only when it is the only one that makes a word this document
//    itself defines; otherwise the question is kept and a teacher is asked.
// -----------------------------------------------------------------------
for (const t of tables) {
  const heading = t.rows[0].map((c) => c.text).join(' ');
  if (!/choose the missing letter/i.test(heading)) continue;

  const unit = unitAt(t.paragraphIndex);
  const wordRow = t.rows.find((r) => r.some((c) => /[a-z]_|_[a-z]/i.test(c.text)));
  const choiceRow = t.rows.find((r) => r !== wordRow && r.some((c) => /\/.*\//.test(c.text)));

  if (!wordRow || !choiceRow) {
    flag('missing letter unreadable', 'could not find the words or the letter choices', unit);
    continue;
  }

  for (let c = 0; c < wordRow.length; c += 1) {
    const pattern = (wordRow[c]?.text ?? '').trim().toLowerCase();
    const letters = (choiceRow[c]?.text ?? '')
      .split('/')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);

    if (!pattern.includes('_') || letters.length < 2) continue;

    const options = letters.map((text, i) => ({ id: `o${i + 1}`, text }));
    const fits = letters.filter((l) => vocabulary.has(pattern.replace('_', l)));

    const decided = fits.length === 1;
    questions.push({
      type: 'missing_letter',
      unit,
      prompt: `Choose the missing letter: ${pattern}`,
      payload: { options },
      answerKey: decided ? { correctOptionId: `o${letters.indexOf(fits[0]) + 1}` } : {},
      sourceRef: `p${t.paragraphIndex}-letter-${c + 1}`,
      needsReview: !decided,
      reviewNotes: decided
        ? null
        : fits.length === 0
          ? `The source does not mark the answer, and none of ${letters.join(', ')} completes "${pattern}" into a word this document defines. Please choose the answer.`
          : `The source does not mark the answer, and more than one of ${letters.join(', ')} completes "${pattern}" into a word this document defines. Please choose the answer.`,
      images: [],
    });

    if (!decided) {
      flag('missing letter answer not stated', `"${pattern}" with ${letters.join('/')}`, unit);
    }
  }
}

// -----------------------------------------------------------------------
// 5. Exercises whose answer is written on the line below, between dots.
//
//    Ordering, transformations and short answers all take this shape: the
//    task on one line, the answer under it padded with dot leaders.
// -----------------------------------------------------------------------
const DOTS = /[.…]{3,}/;

/**
 * The answer written under a task, with the dot leaders taken off.
 *
 * A single ellipsis character counts too: several answers begin with one, and
 * leaving it on made the first word of the sentence unmatchable.
 */
const cleanAnswer = (s) =>
  s
    .replace(/…/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Curly and straight quotes are the same character to a reader. */
const sameWord = (a, b) =>
  a.replace(/[’']/g, "'").replace(/[.?!,]/g, '').toLowerCase() ===
  b.replace(/[’']/g, "'").replace(/[.?!,]/g, '').toLowerCase();

for (let li = 0; li < lines.length; li += 1) {
  const { text: line, index: i, line: n } = lines[li];
  if (!line) continue;

  const unit = unitAt(i);

  // --- word ordering ------------------------------------------------------
  // Two units separate the scrambled words with dashes ("The – jungle – is"),
  // two with slashes ("bored / Don't / summer"). Both are the same exercise.
  const scrambled = line.match(/^\s*\d+\s*[)\-.]\s*(.+[–/-].+)$/);
  if (scrambled && (scrambled[1].match(/[–/-]/g) ?? []).length >= 2 && !DOTS.test(line)) {
    const answerLine = lines.slice(li + 1, li + 3).find((l) => DOTS.test(l.text));
    const answer = answerLine ? cleanAnswer(answerLine.text) : '';
    const tokens = scrambled[1]
      .split(/\s*[–/-]\s*/)
      .map((w) => w.replace(/\s*\.\s*$/, '').trim())
      // A lone "?" or "." in the scrambled list is the source's punctuation,
      // not a word to be ordered.
      .filter((w) => w && /[a-z]/i.test(w));

    if (tokens.length >= 3 && answer) {
      // The answer's own word order is what decides the order of the tokens.
      const wanted = answer.replace(/[.?!]$/, '').split(/\s+/);
      const pool = tokens.map((text, n) => ({ id: `t${n + 1}`, text }));

      /**
       * Walk the answer, taking the longest token that matches next.
       *
       * A token is not always one word: the source scrambles phrases as well
       * ("a musician", "the wild", "the missing boy"). Matching word against
       * token one at a time therefore failed on every sentence that used one,
       * so the answer is consumed a token at a time instead, longest first so
       * "the wild" is preferred over "the".
       */
      const remaining = pool.map((t) => ({ ...t, words: t.text.trim().split(/\s+/) }));
      const order = [];
      let at = 0;
      let matched = true;

      while (at < wanted.length && remaining.length) {
        const byLength = remaining
          .map((t, idx) => ({ t, idx }))
          .sort((a, b) => b.t.words.length - a.t.words.length);

        const hit = byLength.find(({ t }) =>
          t.words.every((w, k) => wanted[at + k] !== undefined && sameWord(w, wanted[at + k])),
        );

        if (!hit) {
          matched = false;
          break;
        }

        order.push(hit.t.id);
        at += hit.t.words.length;
        remaining.splice(hit.idx, 1);
      }

      const complete = matched && remaining.length === 0 && at >= wanted.length;
      questions.push({
        type: 'word_ordering',
        unit,
        prompt: 'Order the words to make a sentence.',
        payload: { tokens: pool },
        answerKey: complete ? { order } : {},
        sourceRef: `p${i}-${n}-order`,
        needsReview: !complete,
        reviewNotes: complete
          ? null
          : `The answer written in the source ("${answer}") does not use exactly the words given. Please set the order.`,
        images: [],
      });

      if (!complete) flag('ordering answer does not match its words', answer, unit);
    }
    continue;
  }

  // --- transformations: "1) sentence (Correct)" then the answer below -----
  const transform = line.match(/^\s*\d+\s*[)\-.]\s*(.+?)\s*\(\s*([^)]+?)\s*\)\s*$/);
  if (transform) {
    const answerLine = lines.slice(li + 1, li + 3).find((l) => DOTS.test(l.text));
    const answer = answerLine ? cleanAnswer(answerLine.text) : '';
    if (answer) {
      questions.push({
        type: 'grammar_transformation',
        unit,
        prompt: `${transform[1].trim()}  (${transform[2].trim()})`,
        payload: {},
        answerKey: { accepted: [answer] },
        sourceRef: `p${i}-${n}-transform`,
        needsReview: false,
        reviewNotes: null,
        images: [],
      });
    }
  }
}

// --- drop anything that repeats itself ---------------------------------
const seen = new Set();
const unique = [];
let duplicatesDropped = 0;
for (const q of questions) {
  const key = JSON.stringify([q.type, q.unit, q.prompt, q.payload, q.answerKey]);
  if (seen.has(key)) {
    duplicatesDropped += 1;
    continue;
  }
  seen.add(key);
  unique.push(q);
}

const withUnit = unique.filter((q) => q.unit);
const byUnit = {};
const byType = {};
for (const q of withUnit) {
  byUnit[q.unit] = (byUnit[q.unit] ?? 0) + 1;
  byType[q.type] = (byType[q.type] ?? 0) + 1;
}

console.log(
  JSON.stringify(
    {
      source: file.split('/').pop(),
      extractedAt: new Date().toISOString(),
      questions: withUnit,
      flags,
      summary: {
        total: withUnit.length,
        withoutUnit: unique.length - withUnit.length,
        needingReview: withUnit.filter((q) => q.needsReview).length,
        duplicatesDropped,
        byUnit,
        byType,
      },
    },
    null,
    2,
  ),
);
