/**
 * Says what is in a production database, and changes nothing.
 *
 * Written for the moment after a run was interrupted, when the honest answer
 * to "did it finish?" is that nobody knows. Every script involved refuses to
 * overwrite what it finds, so the risk is not damage but a wrong assumption —
 * re-running something that already ran, or skipping something that did not.
 * This removes the guess.
 *
 * It asserts nothing and always succeeds. Reading the report is the point.
 * Names and counts only: no password, no hash, no email, no connection string.
 *
 *   DIRECT_URL=… node tooling/deploy/production-state.mjs
 */
import { PrismaClient } from '../prisma-client.mjs';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error('DIRECT_URL is not set.');
  process.exit(2);
}

const db = new PrismaClient({ datasourceUrl: url });

/** An email is somebody's, so only its shape is reported. */
function hasEmail(value) {
  return typeof value === 'string' && value.includes('@') ? 'yes' : 'NO';
}

async function main() {
  console.log('\nWhat is in the production database right now.\n');

  const [operators, schools, teachers, admins, students] = await Promise.all([
    db.user.findMany({ where: { role: 'PLATFORM_ADMIN' } }),
    db.school.findMany({ orderBy: { createdAt: 'asc' } }),
    db.user.findMany({ where: { role: 'TEACHER' }, include: { teacherProfile: true } }),
    db.user.count({ where: { role: 'ADMIN' } }),
    db.user.count({ where: { role: 'STUDENT' } }),
  ]);

  console.log('Accounts');
  console.log(`  platform operators : ${operators.length}`);
  for (const o of operators) {
    console.log(`      "${o.username}"  school=${o.schoolId ?? 'none'}  email set=${hasEmail(o.email)}  created ${o.createdAt.toISOString().slice(0, 16)}`);
  }
  console.log(`  school admins      : ${admins}`);
  console.log(`  teachers           : ${teachers.length}`);
  for (const t of teachers) {
    const school = schools.find((s) => s.id === t.schoolId)?.name ?? '(unknown)';
    console.log(`      "${t.username}"  display name="${t.teacherProfile?.displayName ?? '(none)'}"  school="${school}"  email set=${hasEmail(t.email)}  created ${t.createdAt.toISOString().slice(0, 16)}`);
  }
  console.log(`  students           : ${students}`);

  console.log('\nSchools');
  if (schools.length === 0) console.log('  none');
  for (const s of schools) {
    console.log(`      "${s.name}"  ${s.status}  created ${s.createdAt.toISOString().slice(0, 16)}`);
  }

  console.log('\nCurriculum');
  const courses = await db.course.findMany({
    include: { units: { orderBy: { orderIndex: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  if (courses.length === 0) console.log('  no course yet');
  for (const c of courses) {
    const owner = schools.find((s) => s.id === c.ownerSchoolId)?.name ?? 'none';
    console.log(`      "${c.title}"  owner="${owner}"  ${c.status}  units=${c.units.length}`);
    for (const u of c.units) console.log(`          ${u.orderIndex}  "${u.title}"  ${u.status}`);
  }

  // The question that decides whether a course is the imported curriculum or
  // something made by hand: the importers stamp every row they write with its
  // position in the source document.
  const [withRef, withoutRef] = await Promise.all([
    db.question.count({ where: { sourceRef: { not: null } } }),
    db.question.count({ where: { sourceRef: null } }),
  ]);

  console.log('');
  console.log(`  questions from the source document : ${withRef}`);
  console.log(`  questions with no source reference : ${withoutRef}`);
  console.log(`  vocabulary items                   : ${await db.vocabularyItem.count()}`);
  console.log(`  stored pictures                    : ${await db.mediaAsset.count()}`);
  console.log(`  unit sections                      : ${await db.unitSection.count()}`);

  console.log('\nActivity (any of these above zero would mean somebody has used it)');
  console.log(`  attempts       : ${await db.activityAttempt.count()}`);
  console.log(`  unit progress  : ${await db.sectionProgress.count()}`);
  console.log(`  vocab progress : ${await db.vocabularyProgress.count()}`);
  console.log(`  messages       : ${await db.message.count()}`);

  console.log('\nConfiguration and protections');
  console.log(`  settings values : ${await db.setting.count()}`);

  const [role] = await db.$queryRaw`
    SELECT rolsuper AS super, rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'app_user'
  `;
  const [{ n: policies }] = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_policy`;
  const [{ n: forced }] = await db.$queryRaw`
    SELECT count(*)::int AS n FROM pg_class
    WHERE relrowsecurity AND relforcerowsecurity AND relnamespace = 'public'::regnamespace
  `;
  const [{ n: applied }] = await db.$queryRaw`
    SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL
  `;

  console.log(`  migrations applied : ${applied}`);
  console.log(`  policies           : ${policies}`);
  console.log(`  FORCE RLS tables   : ${forced}`);
  console.log(`  app_user           : superuser=${role?.super}, bypassrls=${role?.bypass}`);

  console.log('\nNothing was changed by this run.\n');
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
