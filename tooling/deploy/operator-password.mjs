/**
 * Explains why a password that verifies from a script cannot be typed by hand.
 *
 * Every automated check has passed: the stored hash verifies against the
 * secret, and a sign-in with that secret succeeds through the live website.
 * A person typing the same password is refused. Both of those can be true at
 * once, and only in one way — the secret holds a character the person is not
 * typing. A newline picked up when the value was pasted is the usual one:
 * invisible in the box it was pasted into, faithfully hashed at bootstrap,
 * faithfully sent by every script since, and impossible to reproduce on a
 * keyboard.
 *
 * So this compares the stored hash against the secret as it is and against the
 * secret without its surrounding whitespace, and says which matches.
 *
 * It prints no password, no hash, and — because this repository is public and
 * its workflow logs with it — not even a length. Only facts about shape.
 *
 * With APPLY=1 it re-hashes the trimmed value onto the operator's account, and
 * nothing else: one field, one row, and only when the trimmed value is not
 * already what is stored.
 *
 *   DIRECT_URL=… PLATFORM_ADMIN_PASSWORD=… [SITE_URL=…] [APPLY=1] \
 *   node tooling/deploy/operator-password.mjs
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '../prisma-client.mjs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const argon2 = require('argon2');

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const secret = process.env.PLATFORM_ADMIN_PASSWORD;
const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const APPLY = process.env.APPLY === '1';

if (!url || !secret) {
  console.error('DIRECT_URL and PLATFORM_ADMIN_PASSWORD are both required.');
  process.exit(2);
}

const db = new PrismaClient({ datasourceUrl: url });

/** What is around the value, never the value. */
function shape(value) {
  const trimmed = value.trim();
  return {
    trimmed,
    differs: trimmed !== value,
    leading: /^\s/.test(value),
    trailing: /\s$/.test(value),
    newline: /[\r\n]/.test(value),
    nonAscii: /[^\x20-\x7e]/.test(trimmed),
  };
}

async function main() {
  console.log('\nWhy the operator can sign in from a script and not from a keyboard.\n');

  const operators = await db.user.findMany({ where: { role: 'PLATFORM_ADMIN' } });

  if (operators.length !== 1) {
    console.error(`REFUSING: found ${operators.length} platform operators. Expected exactly one.`);
    process.exit(1);
  }

  const [operator] = operators;
  const s = shape(secret);

  console.log('The secret, described rather than shown:');
  console.log(`  has whitespace around it        : ${s.differs ? 'YES' : 'no'}`);
  console.log(`    at the start                  : ${s.leading ? 'YES' : 'no'}`);
  console.log(`    at the end                    : ${s.trailing ? 'YES' : 'no'}`);
  console.log(`  contains a line break           : ${s.newline ? 'YES' : 'no'}`);
  console.log(`  has a character outside plain ASCII (once trimmed) : ${s.nonAscii ? 'YES' : 'no'}`);

  const matchesRaw = await argon2.verify(operator.passwordHash, secret);
  const matchesTrimmed = await argon2.verify(operator.passwordHash, s.trimmed);

  console.log('');
  console.log('The stored password:');
  console.log(`  matches the secret exactly as stored in GitHub : ${matchesRaw ? 'YES' : 'no'}`);
  console.log(`  matches the secret with that whitespace removed: ${matchesTrimmed ? 'YES' : 'no'}`);
  console.log('');

  if (matchesTrimmed) {
    console.log('The stored password IS what a person would type. Whatever is refusing the');
    console.log('sign-in, it is not a mismatch between this secret and this account.');
    if (s.nonAscii) {
      console.log('');
      console.log('Note: the value contains a character outside plain ASCII. That is typeable,');
      console.log('but a keyboard layout can produce a different one that looks the same —');
      console.log('a curly quote for a straight one, for instance.');
    }
    return;
  }

  if (!matchesRaw) {
    console.error('The stored password matches NEITHER form of this secret. The secret has been');
    console.error('changed since the account was created, so the account has to be reset from');
    console.error('the current one.');
  } else {
    console.log('So: the account was created from the secret INCLUDING the whitespace around');
    console.log('it, and no keyboard can reproduce that. Every script has agreed with itself');
    console.log('ever since, because every script sends the same stray character.');
  }

  if (!APPLY) {
    console.log('');
    console.log('Nothing was changed. Re-run with APPLY=1 to set the password to the trimmed');
    console.log('value, which is what a person can actually type.');
    return;
  }

  await db.user.update({
    where: { id: operator.id },
    data: { passwordHash: await argon2.hash(s.trimmed, { type: argon2.argon2id }) },
  });

  console.log('');
  console.log(`Set the password for "${operator.username}" from the trimmed secret.`);
  console.log('Nothing else on the account changed, and no other account was touched.');

  const after = await db.user.findUnique({ where: { id: operator.id } });
  const ok = await argon2.verify(after.passwordHash, s.trimmed);
  console.log(`Re-read from the database and verified: ${ok ? 'YES' : 'NO'}`);

  if (!ok) process.exit(1);

  if (site) {
    // Reported, not thrown. The repair above already succeeded and was read
    // back; a website that cannot be reached right now is a separate fact and
    // should read as one rather than as the repair having failed.
    console.log('');
    try {
      const response = await fetch(`${site}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: operator.username, password: s.trimmed }),
        signal: AbortSignal.timeout(90_000),
      });
      console.log(`Signing in through the live website with the typeable password: ${response.status}`);
      if (response.status !== 200) process.exit(1);
    } catch (error) {
      console.error(`Could not reach ${site} to try it: ${error instanceof Error ? error.message : error}`);
      console.error('The password itself is set and verified. Only this last check did not run.');
      process.exit(1);
    }
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
