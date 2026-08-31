/**
 * Reads questions out of the TOP GOAL Word file.
 *
 * Deliberately cautious. Nothing is invented, corrected or completed: text is
 * taken as written, and anything the file does not state plainly is flagged
 * for the teacher rather than guessed.
 *
 * Answers are marked in the file with yellow highlighting, which is a
 * presentation choice rather than structure, so it is treated as a signal and
 * not as truth. Word also splits text mid-word across runs, so runs are joined
 * before anything is read from them.
 *
 *   node extract.mjs <file.docx> > questions.json
 */
import { execFileSync } from 'node:child_process';

const HIGHLIGHT = 'yellow';

/** Unzips one part of the document. */
function readPart(path, part) {
  return execFileSync('unzip', ['-p', path, part], { maxBuffer: 256 * 1024 * 1024 }).toString(
    'utf8',
  );
}

const unescape = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

/**
 * Splits a paragraph into runs, keeping whether each was highlighted.
 *
 * Adjacent runs with the same highlighting are joined, because Word splits
 * words across runs for reasons of its own — "long" can arrive as "l" plus
 * "ong". Without joining, an extracted answer is a fragment.
 */
function runsOf(paragraphXml) {
  const raw = [...paragraphXml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map((m) => m[0]);
  const parts = [];

  for (const run of raw) {
    const text = [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((m) => unescape(m[1]))
      .join('');

    if (!text) continue;

    const highlighted = new RegExp(`<w:highlight w:val="${HIGHLIGHT}"`).test(run);
    const last = parts[parts.length - 1];

    if (last && last.highlighted === highlighted) {
      last.text += text;
    } else {
      parts.push({ text, highlighted });
    }
  }

  return parts;
}

const textOf = (parts) => parts.map((p) => p.text).join('');

/** The highlighted stretches of a paragraph, joined and trimmed. */
const highlightedOf = (parts) =>
  parts
    .filter((p) => p.highlighted)
    .map((p) => p.text.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------

/** Strips anything that is plainly not prose. */
function cleanInstruction(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b[0-9A-F]{8}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node extract.mjs <file.docx>');
  process.exit(1);
}

const xml = readPart(file, 'word/document.xml');
const paragraphs = xml
  .split('</w:p>')
  .map((p, index) => {
    const parts = runsOf(p);
    return {
      index,
      parts,
      // Anything tag-shaped is stripped here, at the one place paragraph text
      // is built, so no later step can inherit markup into a question.
      text: cleanInstruction(textOf(parts)) ?? '',
      highlighted: highlightedOf(parts),
      hasImage: /<a:blip|<w:drawing/.test(p),
      inTable: /<w:tbl[ >]/.test(p),
    };
  })
  .filter((p) => p.text || p.hasImage);

/**
 * Word text boxes repeat their content immediately, so a line appears twice in
 * a row. Only ADJACENT repeats are collapsed: the same words legitimately
 * appear again later in another unit, and removing those silently loses
 * questions and unit headings alike.
 */
const body = paragraphs.filter((p, i, all) => {
  if (!p.text) return true;
  const previous = all[i - 1];
  return !(previous && previous.text === p.text);
});

const UNIT_TITLES = ['Welcome', 'Living Things', 'Lifestyles', 'Interests', 'Professions', 'Grammar Review'];

/**
 * Where each unit's content starts, measured against inline body landmarks.
 *
 * Every unit heading in this document lives in a floating text box, and a
 * floating shape's position in the XML is not its position on the page: Word
 * stores the shape against an anchor paragraph and then draws it wherever the
 * layout puts it. Filing questions by "the last heading seen above them" was
 * therefore ordering against something that has no reliable order, and it put
 * the last seven Professions questions under Grammar Review — the Grammar
 * Review header box is stored before the page it heads.
 *
 * The bilingual vocabulary table that opens each unit is ordinary inline body
 * content, so its position *is* its position. Bands are taken from those
 * tables, and the floating headings are used only to name the band nearest to
 * each one, which is all they can be trusted for.
 */
const bandStarts = body
  .filter((p) => p.inTable && (p.text === 'Arabic' || p.text === 'English'))
  .map((p) => p.index);

const headings = body
  .map((p) => ({
    index: p.index,
    title: UNIT_TITLES.find((t) => p.text === t || p.text === `${t} Unit`),
  }))
  .filter((h) => h.title);

const bands = bandStarts.map((start, i) => {
  const nearest = headings.reduce(
    (best, h) => (Math.abs(h.index - start) < Math.abs(best.index - start) ? h : best),
    headings[0],
  );
  return { unit: nearest?.title ?? null, start, end: bandStarts[i + 1] ?? Infinity };
});

/** Which unit a paragraph belongs to, or null if it sits before any unit. */
function unitAt(position) {
  const band = bands.find((b) => position >= b.start && position < b.end);
  return band ? band.unit : null;
}

const INSTRUCTIONS = [
  { re: /choose the correct answer/i, type: 'multiple_choice' },
  { re: /choose and complete the sentence/i, type: 'complete_sentence' },
  { re: /choose the missing letter/i, type: 'missing_letter' },
  { re: /circle the odd one out/i, type: 'odd_one_out' },
  { re: /for true sentence or .*false sentence/i, type: 'true_false' },
  { re: /match the correct answer/i, type: 'matching' },
  { re: /match the picture with the correct word/i, type: 'picture_matching' },
  { re: /order the words to make sentences/i, type: 'word_ordering' },
  { re: /write the correct spelling under each picture/i, type: 'spelling' },
  { re: /write the correct word under its picture/i, type: 'picture_word' },
  { re: /answer the following questions/i, type: 'short_answer' },
  { re: /read the passage then answer the question/i, type: 'multiple_choice' },
];

const questions = [];
const flags = [];

function flag(reason, detail, paragraph, type) {
  flags.push({ reason, detail, paragraphIndex: paragraph?.index ?? null, type });
}

/**
 * Options written inline, as "a) eat  b) eating  c) are eaten".
 *
 * Finds where each marker sits and takes the text between markers. An earlier
 * version excluded the letters a to d from the option text itself, which
 * silently truncated any option containing one - "aren't" became "ren't" and
 * then matched nothing.
 */
function parseInlineOptions(parts) {
  const text = textOf(parts);
  const markers = [...text.matchAll(/(?:^|\s)([a-d])[).]\s/g)];

  if (markers.length < 2) return null;

  // Markers must run in order (a, b, c...), or this is prose that happens to
  // contain something shaped like a marker.
  const letters = markers.map((m) => m[1]);
  const inOrder = letters.every((l, i) => l.charCodeAt(0) === 97 + i);
  if (!inOrder) return null;

  const options = markers.map((marker, i) => {
    const start = marker.index + marker[0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    return { id: marker[1], text: text.slice(start, end).replace(/\s+/g, ' ').trim() };
  });

  if (options.some((o) => !o.text)) return null;
  return options;
}

/** Which option, if any, the highlighting points at. */
function correctFromHighlight(options, highlighted) {
  if (!highlighted.length) return { id: null, reason: 'nothing is highlighted' };

  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[’']/g, "'");
  const joined = norm(highlighted.join(' '));

  // An exact match is trusted. Anything looser is not: "feel" appearing inside
  // "feeling" would otherwise pick the wrong option, and silently.
  const exact = options.filter((o) => norm(o.text) === joined);
  if (exact.length === 1) return { id: exact[0].id, reason: null };
  if (exact.length > 1) {
    return { id: null, reason: `more than one option reads "${joined}"` };
  }

  // The highlight sometimes covers the stem as well as the answer, so an
  // option appearing as a whole word inside it is accepted when only one does.
  const contained = options.filter((o) => {
    const t = norm(o.text);
    return t && new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(joined);
  });
  if (contained.length === 1) return { id: contained[0].id, reason: null };

  if (contained.length > 1) {
    return { id: null, reason: `highlighted text "${joined}" could be more than one option` };
  }

  return { id: null, reason: `highlighted text "${joined}" matches no option` };
}

// A unit whose heading exists but which has no inline landmark of its own
// cannot be attributed anything. Nothing is guessed into it, and the gap is
// reported: if a later edition adds questions there they will fall into the
// preceding band, and someone has to know to move them.
const banded = new Set(bands.map((b) => b.unit));
for (const title of UNIT_TITLES) {
  if (headings.some((h) => h.title === title) && !banded.has(title)) {
    flag(
      'unit has no inline landmark',
      `"${title}" appears as a heading but has no vocabulary table to anchor it, so no question can be attributed to it by position. Any question of its own would be filed under the preceding unit and must be moved by hand.`,
      null,
      'unit',
    );
  }
}

let currentType = null;
let currentInstruction = null;

for (const p of body) {
  const instruction = INSTRUCTIONS.find((i) => i.re.test(p.text));

  if (instruction) {
    currentType = instruction.type;
    currentInstruction = p.text;
    continue;
  }

  if (!currentType || !p.text) continue;

  const unit = unitAt(p.index);

  // --- True / False: a sentence followed by ( T ) or ( F ) -----------------
  if (currentType === 'true_false') {
    const m = p.text.match(/^(.*?)\(\s*([TF])\s*\)\s*$/i);
    if (m && m[1].trim()) {
      questions.push({
        type: 'true_false',
        unit,
        prompt: m[1].trim(),
        payload: {},
        answerKey: { correct: m[2].toUpperCase() === 'T' },
        sourceRef: `p${p.index}`,
        needsReview: false,
        reviewNotes: null,
      });
    }
    continue;
  }

  // --- Odd one out: words separated by dashes ------------------------------
  if (currentType === 'odd_one_out') {
    const words = p.text.split(/\s+[–-]\s+/).map((w) => w.trim()).filter(Boolean);
    if (words.length >= 3) {
      const options = words.map((w, i) => ({ id: String.fromCharCode(97 + i), text: w }));
      const { id, reason } = correctFromHighlight(options, p.highlighted);

      questions.push({
        type: 'odd_one_out',
        unit,
        // Only the instruction's own words, never anything else that shared
        // the paragraph.
        prompt: cleanInstruction(currentInstruction) ?? 'Circle the odd one out',
        payload: { options },
        answerKey: id ? { correctOptionId: id } : {},
        sourceRef: `p${p.index}`,
        needsReview: !id,
        reviewNotes: id ? null : `The correct answer could not be read: ${reason}.`,
      });

      if (!id) flag('odd_one_out answer unclear', reason, p, 'odd_one_out');
    }
    continue;
  }

  // --- Choice kinds: a numbered stem, then options -------------------------
  if (['multiple_choice', 'complete_sentence', 'missing_letter'].includes(currentType)) {
    const options = parseInlineOptions(p.parts);

    if (options) {
      // The stem is the numbered line above this one.
      const previous = body[body.indexOf(p) - 1];
      const stem = previous && !parseInlineOptions(previous.parts) ? previous.text : null;
      const { id, reason } = correctFromHighlight(options, p.highlighted);

      questions.push({
        type: currentType,
        unit,
        prompt: stem ?? cleanInstruction(currentInstruction) ?? '',
        payload: { options },
        answerKey: id ? { correctOptionId: id } : {},
        sourceRef: `p${p.index}`,
        needsReview: !id || !stem,
        reviewNotes:
          [
            id ? null : `The correct answer could not be read: ${reason}.`,
            stem ? null : 'The question text above the options could not be identified.',
          ]
            .filter(Boolean)
            .join(' ') || null,
      });

      if (!id) flag('choice answer unclear', reason, p, currentType);
      if (!stem) flag('choice stem unclear', 'no question text found above the options', p, currentType);
    }
    continue;
  }

  // --- Kinds whose structure is a table or depends on a picture ------------
  // Matching pairs, word ordering, spelling under a picture and picture
  // matching all live in tables or beside images. Flattened text loses which
  // cell or picture went with which, so these are recorded as needing a
  // teacher rather than reconstructed from guesswork.
  if (['matching', 'word_ordering', 'spelling', 'picture_word', 'picture_matching', 'short_answer'].includes(currentType)) {
    if (p.text.length > 3) {
      flag(
        `${currentType} needs a teacher`,
        'this kind is laid out in a table or against a picture, and the association cannot be read reliably from the text',
        p,
        currentType,
      );
    }
    continue;
  }
}

/**
 * Word stores text-box content twice, in two places rather than side by side,
 * so the same question is read out of the file twice. Two questions with the
 * same wording AND the same options are the same question, so the first is
 * kept and the second dropped. Deduplicating paragraphs instead was wrong in
 * both directions: globally it discarded real questions that repeat wording,
 * and adjacently it caught nothing at all.
 */
const uniqueQuestions = [];
const seenQuestions = new Set();
let duplicatesDropped = 0;

for (const q of questions) {
  const key = JSON.stringify([q.type, q.prompt, q.payload, q.answerKey]);
  if (seenQuestions.has(key)) {
    duplicatesDropped += 1;
    continue;
  }
  seenQuestions.add(key);
  uniqueQuestions.push(q);
}

console.log(
  JSON.stringify(
    {
      source: file.split('/').pop(),
      extractedAt: new Date().toISOString(),
      questions: uniqueQuestions,
      flags,
      summary: {
        total: uniqueQuestions.length,
        duplicatesDropped,
        needingReview: uniqueQuestions.filter((q) => q.needsReview).length,
        byType: uniqueQuestions.reduce((acc, q) => ({ ...acc, [q.type]: (acc[q.type] ?? 0) + 1 }), {}),
        flaggedForManualEntry: flags.length,
      },
    },
    null,
    2,
  ),
);
