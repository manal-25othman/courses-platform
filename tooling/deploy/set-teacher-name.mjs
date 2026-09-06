/**
 * Corrects the name a teacher's students see, without creating a second one.
 *
 * `bootstrap.ts` takes the display name from the environment and refuses to
 * touch a teacher who already exists — which is the right instinct for a
 * script that also sets a password, and the wrong outcome when the only thing
 * that needs changing is a name typed differently the first time. Deleting and
 * re-running would mean a new account, a new password and a broken session.
 *
 * So this changes one field on one row, and only when it is safe to: the
 * teacher is the one holding the address given here, and there is exactly one
 * of her. Anything else and it refuses rather than guessing which account was
 * meant.
 *
 * Safe to run twice: a name already correct is left alone.
 *
 *   TEACHER_EMAIL=… TEACHER_NAME='…' DIRECT_URL=… node tooling/deploy/set-teacher-name.mjs
 */
import { PrismaClient } from '../prisma-client.mjs';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const email = process.env.TEACHER_EMAIL?.trim();
const name = process.env.TEACHER_NAME?.trim();

if (!url || !email || !name) {
  console.error('DIRECT_URL, TEACHER_EMAIL and TEACHER_NAME are all required.');
  process.exit(2);
}

const db = new PrismaClient({ datasourceUrl: url });

async function main() {
  const teachers = await db.user.findMany({
    where: { role: 'TEACHER' },
    include: { teacherProfile: true },
  });

  if (teachers.length === 0) {
    console.log('No teacher exists yet. Nothing to correct.');
    return;
  }

  if (teachers.length > 1) {
    console.error(`REFUSING: ${teachers.length} teachers exist. This is written for the first one only.`);
    process.exit(1);
  }

  const [teacher] = teachers;

  // The address is the identity here, and it is never printed: only whether
  // it is the one this run was given.
  if (teacher.email?.trim().toLowerCase() !== email.toLowerCase()) {
    console.error(
      'REFUSING: the teacher on record does not hold the address this run was given. ' +
        'Correcting the wrong account is worse than correcting none.',
    );
    process.exit(1);
  }

  const current = teacher.teacherProfile?.displayName ?? null;

  if (current === name) {
    console.log(`The teacher is already shown as "${name}". Nothing to change.`);
    return;
  }

  if (teacher.teacherProfile) {
    await db.teacherProfile.update({
      where: { userId: teacher.id },
      data: { displayName: name },
    });
    console.log(`Display name changed from "${current}" to "${name}".`);
  } else {
    await db.teacherProfile.create({ data: { userId: teacher.id, displayName: name } });
    console.log(`Display name set to "${name}" (the profile was missing).`);
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
