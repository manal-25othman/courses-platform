/**
 * Puts the source-rights hold back.
 *
 * The confirmed decision (2026-08-31, §51) is that nothing from the supplied
 * source file reaches students until the client confirms she holds the right
 * to use and distribute it. Every unit and every imported question was DRAFT
 * before Phase 6 began; Living Things and Lifestyles were published purely so
 * the browser suites had something to run against, which also published 21
 * imported questions.
 *
 * This reverses exactly that, and nothing else: only records that came from
 * the source file, and only from PUBLISHED back to DRAFT. Nothing is promoted.
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
