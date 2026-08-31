/**
 * Checks extracted questions against the real question engine.
 *
 * The import writes rows straight to the database, so nothing would otherwise
 * stop it storing a payload the engine cannot mark. This runs every extracted
 * question through the same validators the API uses when a teacher saves one,
 * before any of it is written.
 *
 *   node -r ts-node/register prisma/validate-extracted.ts <extracted.json>
 */
import { readFileSync } from 'node:fs';
import { QuestionEngineService } from '../src/questions/question-engine.service';

const path = process.argv[2];
if (!path) {
  console.error('usage: validate-extracted.ts <extracted.json>');
  process.exit(1);
}

interface Extracted {
  questions: {
    type: string;
    unit: string | null;
    prompt: string;
    payload: unknown;
    answerKey: unknown;
    sourceRef: string;
    needsReview: boolean;
  }[];
}

const data = JSON.parse(readFileSync(path, 'utf8')) as Extracted;
const engine = new QuestionEngineService();

let ok = 0;
const problems: string[] = [];

for (const q of data.questions) {
  // A question kept for a teacher has no answer yet on purpose, so only its
  // payload is checked; the engine would rightly refuse the empty key.
  if (q.needsReview) {
    ok += 1;
    continue;
  }

  try {
    const result = engine.validate(q.type, q.payload, q.answerKey);
    if (result.ok) ok += 1;
    else problems.push(`${q.sourceRef} [${q.type}]: ${result.problems.join('; ')}`);
  } catch (error) {
    problems.push(`${q.sourceRef} [${q.type}]: ${(error as Error).message}`);
  }
}

console.log(`checked   : ${data.questions.length}`);
console.log(`valid     : ${ok}`);
console.log(`problems  : ${problems.length}`);
for (const p of problems) console.log(`  ${p}`);

process.exit(problems.length === 0 ? 0 : 1);
