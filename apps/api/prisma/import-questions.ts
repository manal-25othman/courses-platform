/**
 * Loads extracted questions into the database.
 *
 * Everything arrives as a DRAFT and nothing becomes visible to students on its
 * own. Anything the extractor was unsure of is marked for review, so a teacher
 * sees it before it can be published (SRS 32, 37.7).
 *
 * Runs as the owner connection, like the other maintenance scripts.
 *
 *   SCHOOL_NAME="..." node -r ts-node/register prisma/import-questions.ts <extracted.json>
 */
import { readFileSync } from 'node:fs';
import { ContentStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

interface Extracted {
  questions: {
    type: string;
    unit: string | null;
    prompt: string;
    payload: Record<string, unknown>;
    answerKey: Record<string, unknown>;
    sourceRef: string;
    needsReview: boolean;
    reviewNotes: string | null;
  }[];
  flags: { reason: string; detail: string; paragraphIndex: number | null; type: string }[];
  summary: Record<string, unknown>;
}

async function main(): Promise<void> {
  const path = process.argv[2];

  if (!path) {
    console.error('usage: import-questions.ts <extracted.json>');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(path, 'utf8')) as Extracted;

  const course = await prisma.course.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!course) {
    console.error('No course exists yet. Create one in the teacher screens first.');
    process.exit(1);
  }

  const units = await prisma.unit.findMany({ where: { courseId: course.id } });
  const unitByTitle = new Map(units.map((u) => [u.title, u]));

  let created = 0;
  let skippedNoUnit = 0;
  let flaggedForReview = 0;
  const perUnitOrder = new Map<string, number>();

  for (const q of data.questions) {
    const unit = q.unit ? unitByTitle.get(q.unit) : undefined;

    if (!unit) {
      // Never guessed at. A question whose unit could not be read is left out
      // and reported, rather than filed under the wrong unit.
      skippedNoUnit += 1;
      continue;
    }

    const order = (perUnitOrder.get(unit.id) ?? -1) + 1;
    perUnitOrder.set(unit.id, order);

    // An answer that could not be read is still imported, so the teacher can
    // supply it, but it is marked and cannot be published as it stands.
    const missingAnswer = Object.keys(q.answerKey).length === 0;
    const needsReview = q.needsReview || missingAnswer;

    await prisma.question.create({
      data: {
        unitId: unit.id,
        typeKey: q.type,
        prompt: q.prompt,
        payload: q.payload as never,
        answerKey: q.answerKey as never,
        orderIndex: order,
        status: ContentStatus.DRAFT,
        needsReview,
        reviewNotes: q.reviewNotes,
        sourceRef: q.sourceRef,
      },
    });

    created += 1;
    if (needsReview) flaggedForReview += 1;
  }

  console.log(`Imported ${created} questions, all as drafts.`);
  console.log(`  needing a teacher's review : ${flaggedForReview}`);
  console.log(`  left out, unit unclear     : ${skippedNoUnit}`);
  console.log(`  parts of the file needing manual entry: ${data.flags.length}`);
  console.log('\nNothing is visible to students until a teacher publishes it.');
}

main()
  .catch((error: unknown) => {
    console.error('Import failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
