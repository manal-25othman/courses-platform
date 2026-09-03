/**
 * Creates the platform operator.
 *
 * Somebody has to be first. Schools, and the administrator who runs each one,
 * are made from the platform screens — but the person who makes them cannot
 * make herself, so this script exists and nothing else does.
 *
 * Run once per environment:
 *
 *   PLATFORM_ADMIN_USERNAME=operator \
 *   PLATFORM_ADMIN_EMAIL=operator@example.com \
 *   PLATFORM_ADMIN_PASSWORD='a-long-password' \
 *   npm run db:platform-admin -w @courses/api
 *
 * The account belongs to no school, which the database insists on: see
 * `users_platform_admin_has_no_school`. It has no display name of its own —
 * names live on the teacher and student profiles, which are school-scoped and
 * so are not hers — and the screens fall back to her username. Safe to run
 * twice: it will not overwrite an operator who already exists.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

// The owner connection, as every maintenance script uses: the running
// application connects as the restricted role the row-level policies apply to.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const MIN_PASSWORD_LENGTH = 12;

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    console.error(`Missing ${name}. See the comment at the top of prisma/platform-admin.ts.`);
    process.exit(1);
  }

  return value;
}

async function main(): Promise<void> {
  const username = required('PLATFORM_ADMIN_USERNAME');
  // Required, and for the same reason a teacher's is: she has nobody above her
  // to reset her password, so email recovery is her only way back in.
  const email = required('PLATFORM_ADMIN_EMAIL');
  const password = required('PLATFORM_ADMIN_PASSWORD');

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`PLATFORM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { role: UserRole.PLATFORM_ADMIN } });

  if (existing) {
    console.log('A platform operator already exists. Nothing to do.');
    return;
  }

  const operator = await prisma.user.create({
    data: {
      schoolId: null,
      role: UserRole.PLATFORM_ADMIN,
      username,
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });

  console.log(`Platform operator created: ${operator.username}`);
  console.log('\nSign in at POST /api/v1/auth/login, then open /admin to add the first school.');
}

main()
  .catch((error: unknown) => {
    console.error('Creating the platform operator failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
