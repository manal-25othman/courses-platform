/**
 * Checks that the curriculum in a database is the one the source document
 * describes, and that nothing else got in.
 *
 * Counts alone would not settle it. A database with the right number of
 * questions could still hold somebody's hand-made fixtures, so the test that
 * matters is provenance: every question the importers write carries the
 * paragraph it came from, and anything without one was made another way.
 *
 *   SCHOOL_NAME='…' DIRECT_URL=… node tooling/deploy/verify-curriculum.mjs
 */
import { PrismaClient } from '../prisma-client.mjs';
import { UNIT_TITLES } from '../content-import/units.mjs';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const schoolName = process.env.SCHOOL_NAME;

if (!url || !schoolName) {
  console.error('DIRECT_URL and SCHOOL_NAME are both required.');
  process.exit(2);
}

/**
 * What the verified source yields, measured by running the approved chain
 * against it on a clean database. Vocabulary is per unit because a total can
 * hide two units swapping their share.
 */
const EXPECTED = {
  questions: 171,
  picturesOnQuestions: 53,
  /**
   * The five the teacher's recorded decisions do not answer: one true/false
   * exercise in Welcome that the source states without marking which is which.
   * Named rather than counted, so a different five would not pass quietly.
   */
  stillUnanswered: ['p107-circle-1', 'p107-circle-2', 'p107-circle-3', 'p107-circle-4', 'p107-circle-5'],
  vocabulary: { Welcome: 18, 'Living Things': 26, Lifestyles: 36, Interests: 26, Professions: 26 },
  grammarSections: 8,
  preliminary: new Set(['Welcome', 'Grammar Review']),
};

const db = new PrismaClient({ datasourceUrl: url });
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\nChecking the curriculum against the verified source.\n');

  const schools = await db.school.findMany({ where: { name: schoolName } });
  const school = schools.length === 1 ? schools[0] : null;
  record('The school exists, exactly once', school !== null, `${schools.length} found`);

  const courses = await db.course.findMany({ include: { units: { orderBy: { orderIndex: 'asc' } } } });
  record('Exactly one course exists', courses.length === 1, `${courses.length} found`);

  const course = courses[0];
  record(
    'It belongs to the school and is titled as the application titles it',
    course?.ownerSchoolId === school?.id && course?.title === 'TOP GOAL',
    course ? `"${course.title}", owner matches: ${course.ownerSchoolId === school?.id}` : '',
  );
  record(
    'Nothing is published yet, so no girl can see work a teacher has not approved',
    course?.status === 'DRAFT',
    `course is ${course?.status}`,
  );

  const titles = (course?.units ?? []).map((u) => u.title);
  record(
    'The six bands of the source are all there, in its order',
    JSON.stringify(titles) === JSON.stringify(UNIT_TITLES),
    titles.join(', '),
  );
  record(
    'Welcome and Grammar Review do not count towards a girl’s completion',
    (course?.units ?? []).every((u) => u.countsTowardCompletion === !EXPECTED.preliminary.has(u.title)),
    'client-confirmed 2026-08-31',
  );

  // --- Provenance, which is the check that cannot be faked by a count ------
  const [total, withRef] = await Promise.all([
    db.question.count(),
    db.question.count({ where: { sourceRef: { not: null } } }),
  ]);
  record(
    'Every question came from the source document',
    total > 0 && total === withRef,
    `${withRef} of ${total} carry the paragraph they came from`,
  );
  record(
    'The number of questions is the number the source yields',
    total === EXPECTED.questions,
    `${total}, expected ${EXPECTED.questions}`,
  );

  // Two rows from the same paragraph would mean an importer ran twice and did
  // not recognise its own work — the one way this chain could double content.
  const [{ n: distinctRefs }] = await db.$queryRaw`
    SELECT count(DISTINCT source_ref)::int AS n FROM questions
  `;
  record(
    'No two questions came from the same paragraph',
    distinctRefs === total,
    `${distinctRefs} distinct references across ${total} questions`,
  );

  const drafts = await db.question.count({ where: { status: 'DRAFT' } });
  record('Every question is still a draft', drafts === total, `${drafts} of ${total}`);

  // What the teacher still has to decide, named rather than counted: the point
  // is that these five were left alone, not that five of something were.
  const waiting = await db.question.findMany({
    where: { needsReview: true },
    select: { sourceRef: true, answerKey: true },
    orderBy: { sourceRef: 'asc' },
  });
  const flagged = waiting.length;
  const waitingRefs = waiting.map((q) => q.sourceRef).sort();

  record(
    'The questions still waiting for an answer are the five expected ones',
    JSON.stringify(waitingRefs) === JSON.stringify([...EXPECTED.stillUnanswered].sort()),
    waitingRefs.join(', ') || 'none',
  );
  record(
    'And none of them was given an answer anyway',
    waiting.every((q) => q.answerKey === null || Object.keys(q.answerKey ?? {}).length === 0),
    'no answer key on any of them',
  );

  // --- Vocabulary, unit by unit -------------------------------------------
  const units = course?.units ?? [];
  const vocabPerUnit = {};
  for (const u of units) {
    vocabPerUnit[u.title] = await db.vocabularyItem.count({ where: { unitId: u.id } });
  }
  const vocabRight = Object.entries(EXPECTED.vocabulary).every(([t, n]) => vocabPerUnit[t] === n);
  const vocabTotal = Object.values(vocabPerUnit).reduce((a, b) => a + b, 0);
  record(
    'Every unit has the words the source gives it',
    vocabRight && vocabTotal === 132,
    Object.entries(vocabPerUnit).map(([t, n]) => `${t}=${n}`).join(', '),
  );

  // --- The grammar teaching sheets ----------------------------------------
  const grammar = await db.unitSection.findMany({ where: { typeKey: 'grammar' }, include: { media: true } });
  record(
    'All eight grammar sheets are stored',
    grammar.length === EXPECTED.grammarSections,
    `${grammar.length} sections`,
  );
  record(
    'Each grammar sheet has its picture, not just its title',
    grammar.length > 0 && grammar.every((s) => s.media.some((m) => (m.byteSize ?? 0) > 0)),
    `${grammar.reduce((n, s) => n + s.media.length, 0)} pictures across them`,
  );

  // --- A question with a picture is answerable -----------------------------
  const withPictures = await db.mediaAsset.count({ where: { questionId: { not: null } } });
  record(
    'The pictures questions need came with them',
    withPictures === EXPECTED.picturesOnQuestions,
    `${withPictures} on questions, expected ${EXPECTED.picturesOnQuestions}`,
  );

  const allMedia = await db.mediaAsset.count();
  record(
    'And nothing was stored twice',
    allMedia === EXPECTED.picturesOnQuestions + EXPECTED.grammarSections,
    `${allMedia} pictures in total, expected ${EXPECTED.picturesOnQuestions + EXPECTED.grammarSections}`,
  );

  // --- And nothing that should not be here --------------------------------
  const strangers = {
    students: await db.user.count({ where: { role: 'STUDENT' } }),
    attempts: await db.activityAttempt.count(),
    messages: await db.message.count(),
    progress: await db.sectionProgress.count(),
  };
  const present = Object.entries(strangers).filter(([, n]) => n > 0);
  record(
    'No students, no attempts, no messages — nothing from QA and nothing used yet',
    present.length === 0,
    present.length === 0 ? 'all zero' : present.map(([k, n]) => `${k}=${n}`).join(', '),
  );

  // --- The protections, once more, now that there is content to protect ---
  const [role] = await db.$queryRaw`
    SELECT rolsuper AS super, rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'app_user'
  `;
  const [{ n: policies }] = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_policy`;
  const [{ n: forced }] = await db.$queryRaw`
    SELECT count(*)::int AS n FROM pg_class
    WHERE relrowsecurity AND relforcerowsecurity AND relnamespace = 'public'::regnamespace
  `;
  record(
    'The protections are untouched',
    role?.super === false && role?.bypass === false && policies === 34 && forced === 22,
    `${policies} policies, ${forced} FORCE-RLS tables, app_user restricted`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log('');

  if (failed.length > 0) {
    console.error(`${failed.length} of ${results.length} checks FAILED.`);
    process.exit(1);
  }

  console.log(`All ${results.length} checks passed.`);
  console.log('');
  console.log('Everything is a draft. Nothing reaches a girl until her teacher publishes it,');
  console.log(`and ${flagged} question(s) are waiting for an answer only she can give.`);
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
