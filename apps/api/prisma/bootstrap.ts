/**
 * Creates the first school and its teacher account.
 *
 * Run once, when setting up a new environment. Nothing can sign in before this
 * exists, because accounts are created by the teacher (SRS 27) and the first
 * teacher has nobody to create her.
 *
 * Everything comes from environment variables, so no password is ever written
 * into this file or into the repository.
 *
 *   SCHOOL_NAME="Al Noor School" \
 *   TEACHER_USERNAME=teacher \
 *   TEACHER_EMAIL=teacher@example.com \
 *   TEACHER_NAME="Manal" \
 *   TEACHER_PASSWORD='a-long-password' \
 *   npm run db:bootstrap -w @courses/api
 *
 * Safe to run twice: it will not overwrite an existing teacher.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 12;

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    console.error(`Missing ${name}. See the comment at the top of prisma/bootstrap.ts.`);
    process.exit(1);
  }

  return value;
}

async function main(): Promise<void> {
  const schoolName = required('SCHOOL_NAME');
  const username = required('TEACHER_USERNAME');
  // Required for the teacher, because she has no one above her to reset her
  // password and self-service recovery is her only route back in (SRS 28.5).
  const email = required('TEACHER_EMAIL');
  const displayName = required('TEACHER_NAME');
  const password = required('TEACHER_PASSWORD');

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`TEACHER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { role: UserRole.TEACHER } });

  if (existing) {
    console.log('A teacher account already exists. Nothing to do.');
    return;
  }

  const school = await prisma.school.create({ data: { name: schoolName } });

  const teacher = await prisma.user.create({
    data: {
      schoolId: school.id,
      role: UserRole.TEACHER,
      username,
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      teacherProfile: { create: { displayName } },
    },
  });

  console.log(`School created : ${school.name} (${school.id})`);
  console.log(`Teacher created: ${teacher.username} (${teacher.id})`);
  console.log('\nYou can now sign in at POST /api/v1/auth/login');
}

main()
  .catch((error: unknown) => {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
