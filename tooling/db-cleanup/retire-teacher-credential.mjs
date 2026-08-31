/**
 * Leaves the development teacher account in a known-safe state.
 *
 * The Phase 6.5 recovery test changed her password to a value that ended up in
 * this session's transcript. That value is now retired: the account is given a
 * fresh random password that nothing records — not this script, not the log,
 * not the report — and is flagged so that whatever it is must be changed on
 * first use.
 *
 * Getting back in is the platform's own recovery flow, which is the point:
 * with no RESEND_API_KEY set, the API writes the reset link to its own log.
 */
import { PrismaClient } from '../prisma-client.mjs';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

(async () => {
  const teacher = await db.user.findFirst({
    where: { username: 'teacher' },
    include: { teacherProfile: true },
  });
  if (!teacher) throw new Error('the development teacher account is missing');

  // Generated, used once to make a hash, and never held anywhere else.
  const unrecorded = randomBytes(32).toString('base64url');
  const passwordHash = await argon2.hash(unrecorded, { type: argon2.argon2id });

  await db.user.update({
    where: { id: teacher.id },
    data: { passwordHash, mustChangePassword: true },
  });

  await db.passwordResetToken.deleteMany({ where: { userId: teacher.id } });
  await db.refreshToken.deleteMany({ where: { userId: teacher.id } });

  const after = await db.user.findFirst({
    where: { username: 'teacher' },
    include: { teacherProfile: true },
  });

  console.log('teacher account:');
  console.log(`  username            : ${after.username}`);
  console.log(`  display name        : ${after.teacherProfile.displayName}`);
  console.log(`  e-mail              : ${after.email}`);
  console.log(`  status              : ${after.status}`);
  console.log(`  mustChangePassword  : ${after.mustChangePassword}`);
  console.log(`  whatsapp number     : ${after.teacherProfile.whatsappPhone ?? '(none)'}`);
  console.log(`  open sessions       : ${await db.refreshToken.count({ where: { userId: after.id } })}`);
  console.log(`  outstanding links   : ${await db.passwordResetToken.count({ where: { userId: after.id } })}`);
  console.log('  password            : reset to a value nothing recorded — a reset is required');

  await db.$disconnect();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
