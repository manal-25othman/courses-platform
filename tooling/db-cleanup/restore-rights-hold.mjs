/**
 * Takes source-derived curriculum back to DRAFT.
 *
 * Written for the source-rights hold, which is now lifted: the client
 * confirmed on 2026-09-02 that she holds the rights to use and publish this
 * content (§51), so this is no longer something anyone has to run.
 *
 * It is kept because what it does is still worth having — an unpublish that
 * cannot go wrong. It touches only records that came from the source file,
 * and only ever moves them from PUBLISHED back to DRAFT. Nothing is promoted,
 * so running it can hide content but never expose it. That makes it the right
 * tool for pulling material back out of students' hands in a hurry, whatever
 * the reason.
 */
import { PrismaClient } from '../prisma-client.mjs';
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

(async () => {
  const questions = await db.question.updateMany({
    where: { status: 'PUBLISHED', sourceRef: { not: null } },
    data: { status: 'DRAFT' },
  });

  const units = await db.unit.updateMany({
    where: { status: 'PUBLISHED' },
    data: { status: 'DRAFT' },
  });

  const words = await db.vocabularyItem.updateMany({
    where: { status: 'PUBLISHED' },
    data: { status: 'DRAFT' },
  });

  const sections = await db.unitSection.updateMany({
    where: { status: 'PUBLISHED' },
    data: { status: 'DRAFT' },
  });

  console.log(`  imported questions returned to DRAFT : ${questions.count}`);
  console.log(`  units returned to DRAFT              : ${units.count}`);
  console.log(`  words returned to DRAFT              : ${words.count}`);
  console.log(`  sections returned to DRAFT           : ${sections.count}`);

  const stillPublished = await db.question.count({ where: { status: 'PUBLISHED' } });
  console.log(`  anything still visible to a student  : ${stillPublished}`);

  await db.$disconnect();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
