/**
 * Checks what the bootstrap scripts left behind, and what they did not.
 *
 * Two scripts run before this one and both are quiet by design: one creates
 * the platform operator, the other the school and its first teacher. Neither
 * says whether the result is the shape a production database should be in —
 * whether the operator really belongs to no school, whether anything else
 * crept in, whether the policies that were verified before the accounts
 * existed still hold now that there are rows for them to apply to.
 *
 * So this asks, as the owner, and says nothing about any credential: no
 * password, no hash, no email, no connection string. Names and counts only.
 *
 *   SCHOOL_NAME=… DIRECT_URL=… node tooling/deploy/verify-bootstrap.mjs
 */
import { PrismaClient } from '../prisma-client.mjs';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const schoolName = process.env.SCHOOL_NAME;

if (!url) {
  console.error('DIRECT_URL is not set.');
  process.exit(2);
}
if (!schoolName) {
  console.error('SCHOOL_NAME is not set. It is what the school is checked against.');
  process.exit(2);
}

const db = new PrismaClient({ datasourceUrl: url });
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\nChecking what the production bootstrap created.\n');

  // --- The people who should exist ---------------------------------------
  const operators = await db.user.findMany({ where: { role: 'PLATFORM_ADMIN' } });
  record('Exactly one platform operator exists', operators.length === 1, `${operators.length} found`);
  record(
    'The operator belongs to no school',
    operators.length === 1 && operators[0].schoolId === null,
    operators.length === 1 ? `schoolId ${operators[0].schoolId ?? 'null'}` : 'no operator to check',
  );
  record(
    'The operator can recover her own password',
    operators.length === 1 && typeof operators[0].email === 'string' && operators[0].email.includes('@'),
    'an email is set',
  );

  const schools = await db.school.findMany();
  record('Exactly one school exists', schools.length === 1, `${schools.length} found`);
  record(
    'It is the school that was asked for, and it is open',
    schools.length === 1 && schools[0].name === schoolName && schools[0].status === 'ACTIVE',
    schools.length === 1 ? `"${schools[0].name}", ${schools[0].status}` : 'no school to check',
  );

  const teachers = await db.user.findMany({
    where: { role: 'TEACHER' },
    include: { teacherProfile: true },
  });
  record('Exactly one teacher exists', teachers.length === 1, `${teachers.length} found`);
  record(
    'The teacher belongs to that school',
    teachers.length === 1 && schools.length === 1 && teachers[0].schoolId === schools[0].id,
    'school matches',
  );
  record(
    'The teacher has a profile with a name to show',
    teachers.length === 1 && (teachers[0].teacherProfile?.displayName ?? '') !== '',
    teachers.length === 1 ? `displayName "${teachers[0].teacherProfile?.displayName ?? ''}"` : '',
  );
  record(
    'The teacher can recover her own password',
    teachers.length === 1 && typeof teachers[0].email === 'string' && teachers[0].email.includes('@'),
    'an email is set',
  );

  // Never the password itself, and never the hash: only that it was hashed
  // the way the application hashes, so a plain or weakly-hashed password
  // cannot sit there unnoticed.
  const weak = [...operators, ...teachers].filter((u) => !u.passwordHash.startsWith('$argon2id$'));
  record('Every password was stored as an argon2id hash', weak.length === 0, `${weak.length} that were not`);

  record(
    'Neither account is asked to change its password on first use',
    [...operators, ...teachers].every((u) => u.mustChangePassword === false),
    'these two chose their own',
  );

  // --- And nobody else ----------------------------------------------------
  const [admins, students] = await Promise.all([
    db.user.count({ where: { role: 'ADMIN' } }),
    db.user.count({ where: { role: 'STUDENT' } }),
  ]);
  record('No students yet', students === 0, `${students} found`);
  record('No school administrator was created', admins === 0, `${admins} found`);

  // --- Nothing that belongs to a later step, and nothing from QA ----------
  const empty = {
    courses: await db.course.count(),
    units: await db.unit.count(),
    questions: await db.question.count(),
    vocabulary: await db.vocabularyItem.count(),
    media: await db.mediaAsset.count(),
    attempts: await db.activityAttempt.count(),
    messages: await db.message.count(),
    'unit progress': await db.sectionProgress.count(),
  };
  const notEmpty = Object.entries(empty).filter(([, n]) => n > 0);
  record(
    'No curriculum, no attempts, no messages — nothing from a later step or from QA',
    notEmpty.length === 0,
    notEmpty.length === 0
      ? 'every content and activity table empty'
      : notEmpty.map(([k, n]) => `${k}=${n}`).join(', '),
  );

  // --- The settings the platform runs on ----------------------------------
  const settings = await db.setting.count();
  record(
    'The confirmed settings are present',
    settings >= 18,
    `${settings} values (passing score, attempt caps, retry rules)`,
  );

  // --- The protections that were verified before any of this existed ------
  const [role] = await db.$queryRaw`
    SELECT rolsuper AS super, rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'app_user'
  `;
  record(
    'The runtime role still cannot bypass row-level security',
    role?.super === false && role?.bypass === false,
    `superuser=${role?.super}, bypassrls=${role?.bypass}`,
  );

  const [{ n: policies }] = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_policy`;
  record('All 34 row-level policies are still in place', policies === 34, `${policies} policies`);

  const [{ n: forced }] = await db.$queryRaw`
    SELECT count(*)::int AS n FROM pg_class
    WHERE relrowsecurity AND relforcerowsecurity AND relnamespace = 'public'::regnamespace
  `;
  record('All 22 tenant tables still FORCE row-level security', forced === 22, `${forced} tables`);

  // The rows just written must be reachable only under a school's scope. This
  // is the first time there has been a row to prove it with.
  const scoped = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schools[0]?.id ?? ''}, true)`;
    return tx.$queryRaw`SELECT count(*)::int AS n FROM users WHERE role = 'TEACHER'`;
  });
  record(
    'The teacher is visible inside her own school',
    scoped[0]?.n === 1,
    `${scoped[0]?.n} teacher(s) under that scope`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log('');

  if (failed.length > 0) {
    console.error(`${failed.length} of ${results.length} checks FAILED.`);
    process.exit(1);
  }

  console.log(`All ${results.length} checks passed. Production has an operator, a school and a teacher,`);
  console.log('and nothing else.');
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
