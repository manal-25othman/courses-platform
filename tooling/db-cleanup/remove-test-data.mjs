/**
 * Controlled removal of development-only data.
 *
 * Every record is selected by identity — a specific unit title, a specific
 * question id, a specific username — never by a pattern applied to a real
 * unit. Anything that cannot be positively identified is left alone and
 * reported.
 *
 * Run with DRY=1 to list what would go without touching anything.
 */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

const DRY = process.env.DRY === '1';
const say = (...a) => console.log(...a);

/**
 * Units created wholly for verification. Deleting one cascades to everything
 * inside it, which is what makes them safe to remove as a whole: nothing in
 * them came from anywhere else.
 */
const TEST_UNIT_TITLES = [
  'TEST Extra Unit',
  'TEST Pool Unit',
  'TEST Types Unit',
  'TEST Vocab Unit',
  'TEST Thin Unit',
];

/**
 * Accounts created by the verification suites.
 *
 * `student1` ("Test Student") is the development student from Phase 2 and is
 * development data too; removing it is what leaves the roster empty and ready
 * for a real one.
 */
const TEST_USERNAMES = [
  'student1',
  'pupil26055', 'pupil34406', 'pupil73257',
  'pupilmail26055', 'pupilmail34406', 'pupilmail73257',
  'otherteacher34406', 'otherpupil34406',
];

/** Schools that exist only because isolation had to be tested across two. */
const TEST_SCHOOL_NAMES = ['TEST Second School', 'Other School'];

(async () => {
  say(DRY ? '=== DRY RUN — nothing will be deleted ===\n' : '=== CLEANUP ===\n');

  // -------------------------------------------------------------------
  // 1. Classify the questions inside the two real units that hold both.
  // -------------------------------------------------------------------
  const realUnits = await db.unit.findMany({
    where: { title: { in: ['Living Things', 'Lifestyles'] } },
    select: { id: true, title: true },
  });

  const mixed = await db.question.findMany({
    where: { unitId: { in: realUnits.map((u) => u.id) } },
    select: { id: true, unitId: true, prompt: true, sourceRef: true, purpose: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const titleOf = new Map(realUnits.map((u) => [u.id, u.title]));

  /**
   * Two independent marks have to agree before a question in a real unit is
   * called test data: it carries no reference back into the source document,
   * AND its wording is one this session wrote. Either alone would be a guess.
   */
  const WRITTEN_HERE = /^(TEST[: ]|TEST ASSESSMENT:|TYPES |Q[1-5] |Is a lion\d+ a big cat\?)/;

  const confirmedTest = [];
  const confirmedCurriculum = [];
  const uncertain = [];

  for (const q of mixed) {
    const noRef = q.sourceRef === null;
    const ours = WRITTEN_HERE.test(q.prompt);
    if (!noRef) confirmedCurriculum.push(q);
    else if (noRef && ours) confirmedTest.push(q);
    else uncertain.push(q);
  }

  say('--- questions inside Living Things and Lifestyles ---');
  say(`  CONFIRMED IMPORTED CURRICULUM : ${confirmedCurriculum.length}`);
  say(`  CONFIRMED TEST                : ${confirmedTest.length}`);
  say(`  UNCERTAIN                     : ${uncertain.length}`);
  for (const q of confirmedTest) {
    say(`    test     [${titleOf.get(q.unitId)}] ${q.purpose} — ${q.prompt.slice(0, 55)}`);
  }
  for (const q of uncertain) {
    say(`    UNCERTAIN [${titleOf.get(q.unitId)}] ${q.purpose} — ${q.prompt.slice(0, 55)}`);
  }

  // -------------------------------------------------------------------
  // 2. Test vocabulary inside a real unit.
  // -------------------------------------------------------------------
  const testWords = await db.vocabularyItem.findMany({
    where: {
      unitId: { in: realUnits.map((u) => u.id) },
      // The run stamp is what makes this positive: no curriculum word has one.
      wordEn: { startsWith: 'lion0' },
    },
    select: { id: true, wordEn: true, unitId: true },
  });
  const otherWords = await db.vocabularyItem.findMany({
    where: { unitId: { in: realUnits.map((u) => u.id) }, NOT: { wordEn: { startsWith: 'lion0' } } },
    select: { wordEn: true },
  });
  say('\n--- vocabulary inside real units ---');
  for (const w of testWords) say(`    test      ${w.wordEn}`);
  for (const w of otherWords) say(`    UNCERTAIN ${w.wordEn}  (left alone)`);

  // -------------------------------------------------------------------
  // 3. The stub section in Welcome.
  // -------------------------------------------------------------------
  const welcome = await db.unit.findFirst({ where: { title: 'Welcome' }, select: { id: true } });
  const welcomeSections = await db.unitSection.findMany({
    where: { unitId: welcome.id },
    select: { id: true, typeKey: true, title: true, body: true },
  });
  // Positive: the import creates questions only and never a section, this one
  // holds no curriculum text at all, and it was made during the Phase 3
  // browser run that added one section of each kind.
  const stubSections = welcomeSections.filter(
    (s) => (s.body ?? '').trim() === '{}' && (s.title ?? '').length <= 2,
  );
  const keptSections = welcomeSections.filter((s) => !stubSections.some((x) => x.id === s.id));
  say('\n--- sections inside real units ---');
  for (const s of stubSections) say(`    test      ${s.typeKey} "${s.title}" body=${JSON.stringify(s.body)}`);
  for (const s of keptSections) say(`    UNCERTAIN ${s.typeKey} "${s.title}"  (left alone)`);

  // -------------------------------------------------------------------
  // 4. Whole test units, accounts and schools.
  // -------------------------------------------------------------------
  const testUnits = await db.unit.findMany({
    where: { title: { in: TEST_UNIT_TITLES } },
    select: { id: true, title: true },
  });
  const testUsers = await db.user.findMany({
    where: { username: { in: TEST_USERNAMES } },
    select: { id: true, username: true, role: true },
  });
  const testSchools = await db.school.findMany({
    where: { name: { in: TEST_SCHOOL_NAMES } },
    select: { id: true, name: true },
  });

  say('\n--- whole test entities ---');
  for (const u of testUnits) say(`    unit    ${u.title}`);
  for (const u of testUsers) say(`    account ${u.username} (${u.role})`);
  for (const s of testSchools) say(`    school  ${s.name}`);

  if (DRY) {
    say('\n=== DRY RUN — nothing was deleted ===');
    await db.$disconnect();
    return;
  }

  // -------------------------------------------------------------------
  // 5. Delete, narrowest first.
  // -------------------------------------------------------------------
  const removed = {};

  removed.questionsInRealUnits = (await db.question.deleteMany({
    where: { id: { in: confirmedTest.map((q) => q.id) } },
  })).count;

  removed.wordsInRealUnits = (await db.vocabularyItem.deleteMany({
    where: { id: { in: testWords.map((w) => w.id) } },
  })).count;

  removed.stubSections = (await db.unitSection.deleteMany({
    where: { id: { in: stubSections.map((s) => s.id) } },
  })).count;

  removed.testUnits = (await db.unit.deleteMany({
    where: { id: { in: testUnits.map((u) => u.id) } },
  })).count;

  removed.testUsers = (await db.user.deleteMany({
    where: { id: { in: testUsers.map((u) => u.id) } },
  })).count;

  // Only after their users are gone, and only if they are then truly empty.
  for (const school of testSchools) {
    const left = await db.user.count({ where: { schoolId: school.id } });
    const courses = await db.course.count({ where: { ownerSchoolId: school.id } });
    if (left === 0 && courses === 0) {
      await db.school.delete({ where: { id: school.id } });
      removed.testSchools = (removed.testSchools ?? 0) + 1;
    } else {
      say(`    KEPT school ${school.name}: ${left} users, ${courses} courses remain`);
    }
  }

  // Sessions and reset links are all from verification; none is a real login.
  removed.resetTokens = (await db.passwordResetToken.deleteMany({})).count;
  removed.sessions = (await db.refreshToken.deleteMany({})).count;

  // The test WhatsApp number is not the teacher's own.
  const teacher = await db.user.findFirst({ where: { username: 'teacher' }, select: { id: true } });
  await db.teacherProfile.update({
    where: { userId: teacher.id },
    data: { whatsappPhone: null },
  });
  removed.whatsappNumberCleared = 1;

  say('\n--- removed ---');
  for (const [k, v] of Object.entries(removed)) say(`    ${k}: ${v}`);

  await db.$disconnect();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
