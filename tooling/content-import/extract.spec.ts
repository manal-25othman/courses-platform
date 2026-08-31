/**
 * Guards the unit attribution in `extract.mjs`.
 *
 * The bug this exists for: unit headings in the curriculum file live in
 * floating text boxes, and a floating shape's position in the XML is not its
 * position on the page. Attributing a question to "the last heading seen
 * above it" therefore filed seven Professions questions under Grammar Review,
 * because the Grammar Review header box is stored before the page it heads.
 *
 * The fixture below reproduces exactly that shape in miniature — a heading for
 * a later section sitting, in document order, between a unit's vocabulary
 * table and that unit's own question — so the test fails if anyone goes back
 * to ordering against headings.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
<w:p><w:r><w:t>Professions</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Arabic</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>English</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>&#1585;&#1575;&#1574;&#1583; &#1601;&#1590;&#1575;&#1569;</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>astronaut</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>Grammar Review</w:t></w:r></w:p>
<w:p><w:r><w:t>Choose the correct answer:</w:t></w:r></w:p>
<w:p><w:r><w:t>1- Who saves people from fire?</w:t></w:r></w:p>
<w:p><w:r><w:t>a) teacher  b) </w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>firefighter</w:t></w:r><w:r><w:t>  c) pilot</w:t></w:r></w:p>
</w:body></w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

interface Extracted {
  questions: {
    type: string;
    unit: string | null;
    prompt: string;
    payload: { options?: { id: string; text: string }[] };
    answerKey: { correctOptionId?: string };
    sourceRef: string;
    needsReview: boolean;
  }[];
  flags: { reason: string; detail: string; type: string }[];
}

let result: Extracted;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'extract-spec-'));
  mkdirSync(join(dir, 'word', '_rels'), { recursive: true });
  writeFileSync(join(dir, '[Content_Types].xml'), contentTypes);
  writeFileSync(join(dir, 'word', 'document.xml'), documentXml);
  writeFileSync(join(dir, 'word', '_rels', 'document.xml.rels'), rels);

  const docx = join(dir, 'fixture.docx');
  execFileSync('zip', ['-q', '-r', docx, '[Content_Types].xml', 'word'], { cwd: dir });

  const script = join(__dirname, 'extract.mjs');
  const out = execFileSync('node', [script, docx], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  result = JSON.parse(out) as Extracted;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('unit attribution', () => {
  it('reads the one question out of the fixture', () => {
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].prompt).toBe('1- Who saves people from fire?');
  });

  it('files a question by the unit whose vocabulary table it follows', () => {
    // The whole point: "Grammar Review" sits between the table and the
    // question in document order, and must not capture it.
    expect(result.questions[0].unit).toBe('Professions');
  });

  it('still reads the answer from the highlighting', () => {
    expect(result.questions[0].answerKey.correctOptionId).toBe('b');
    expect(result.questions[0].needsReview).toBe(false);
  });

  it('reports a unit that has a heading but no inline landmark', () => {
    // Grammar Review has no vocabulary table, so nothing can be attributed to
    // it by position. That has to be said out loud, not passed over: a later
    // edition that adds questions there would file them under Professions.
    const landmark = result.flags.filter((f) => f.type === 'unit');
    expect(landmark).toHaveLength(1);
    expect(landmark[0].detail).toContain('Grammar Review');
  });
});
