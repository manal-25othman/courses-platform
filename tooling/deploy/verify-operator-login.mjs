/**
 * Finds out why a sign-in is refused, without ever saying what the password is.
 *
 * The refusal a caller sees is deliberately the same sentence whether the
 * account does not exist, the password is wrong, or the name was typed into
 * the wrong shape — that is the point of it, and it is why a person staring at
 * "Incorrect username or password" cannot tell which of the three happened.
 * From inside, with the credential the deployment was given, all three can be
 * told apart, and this does, reporting only which one it is.
 *
 * Nothing here prints a password, an email, a hash or a token. It compares and
 * reports the comparison.
 *
 *   DIRECT_URL=… SITE_URL=… PLATFORM_ADMIN_EMAIL=… PLATFORM_ADMIN_PASSWORD=…
 *   node tooling/deploy/verify-operator-login.mjs
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '../prisma-client.mjs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const argon2 = require('argon2');

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
const password = process.env.PLATFORM_ADMIN_PASSWORD;

if (!url || !site || !email || !password) {
  console.error('DIRECT_URL, SITE_URL, PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are all required.');
  process.exit(2);
}

const API = `${site}/api/v1`;
const db = new PrismaClient({ datasourceUrl: url });
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Keeps the cookies a browser would keep, and sends them back. */
function jar() {
  const held = new Map();
  return {
    store(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === '' ) held.delete(name);
        else held.set(name, value);
      }
      return response.headers.getSetCookie?.() ?? [];
    },
    header() {
      return [...held].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    names() {
      return [...held.keys()];
    },
  };
}

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(90_000) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

async function main() {
  console.log('\nWhy the sign-in is refused, and whether the live path works.\n');
  console.log('--- The account, in the database ---\n');

  const operators = await db.user.findMany({ where: { role: 'PLATFORM_ADMIN' } });
  record('The platform operator exists, exactly once', operators.length === 1, `${operators.length} found`);

  const operator = operators[0];
  if (!operator) {
    console.error('\nNothing further can be checked without an operator.');
    process.exit(1);
  }

  record('Her account is active and not deleted', operator.status === 'ACTIVE' && operator.deletedAt === null, `status ${operator.status}`);
  record('She belongs to no school, as the database insists', operator.schoolId === null);

  // The address is compared, never printed.
  record(
    'Her address is the one the deployment was given',
    (operator.email ?? '').trim().toLowerCase() === email.toLowerCase(),
    'compared, not shown',
  );

  record(
    'Her stored password is the one the deployment was given',
    await argon2.verify(operator.passwordHash, password),
    'verified against the stored hash',
  );

  record('She is not required to change it first', operator.mustChangePassword === false);

  // The thing the screenshot is actually showing.
  console.log('');
  console.log(`  Her username is "${operator.username}". The sign-in form asks for a username,`);
  console.log('  and the API looks accounts up by username only — an address typed into that');
  console.log('  box matches nobody, and the refusal is the same sentence either way.');

  console.log('\n--- The live path, through the website ---\n');

  const health = await call('/health');
  record(
    'The website reaches the API through its own address',
    health.status === 200 && JSON.parse(health.text || '{}').database === 'connected',
    `health ${health.status}`,
  );

  // Reproduce the failure, so the diagnosis is demonstrated and not asserted.
  const asEmail = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password }),
  });
  record(
    'Signing in with the address is refused, which is the reported failure',
    asEmail.status === 401,
    `status ${asEmail.status}`,
  );

  const cookies = jar();
  const signIn = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: operator.username, password }),
  });
  const set = cookies.store(signIn);

  record('Signing in with the username succeeds', signIn.status === 200, `status ${signIn.status}`);
  record(
    'Both session cookies come back, httpOnly and SameSite=Lax',
    set.length === 2 && set.every((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)),
    cookies.names().join(', '),
  );
  record(
    'They are set by the website, so a browser will keep them',
    set.every((c) => !/Domain=/i.test(c)),
    'no Domain attribute: they belong to the address the browser is on',
  );

  const me = await call('/auth/me', { headers: { Cookie: cookies.header() } });
  const who = me.status === 200 ? JSON.parse(me.text) : {};
  record('The cookie alone opens the account', me.status === 200, `status ${me.status}`);
  record(
    'And the account is the platform operator',
    who.role === 'PLATFORM_ADMIN',
    `role ${who.role ?? '(none)'} — the website sends this role to /admin`,
  );

  const renewed = await call('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies.header() },
    body: '{}',
  });
  cookies.store(renewed);
  record('Renewing the session works, which is what happens at fifteen minutes', renewed.status === 200, `status ${renewed.status}`);

  const afterRenewal = await call('/auth/me', { headers: { Cookie: cookies.header() } });
  record('The renewed cookie still opens the account', afterRenewal.status === 200, `status ${afterRenewal.status}`);

  const out = await call('/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies.header() },
  });
  // A browser acts on the clearing headers, and so must this: sign-out drops
  // the cookies and revokes the refresh family. The access token it was
  // holding stays cryptographically valid for its fifteen minutes — that is
  // what a stateless token is — but nothing is carrying it any more, and it
  // cannot be renewed into a new one.
  cookies.store(out);
  const afterOut = await call('/auth/me', { headers: { Cookie: cookies.header() } });
  record(
    'Signing out clears the cookies and ends the session',
    out.status === 204 && cookies.names().length === 0 && afterOut.status === 401,
    `logout ${out.status}, ${cookies.names().length} cookies left, then ${afterOut.status}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log('');

  if (failed.length > 0) {
    console.error(`${failed.length} of ${results.length} checks FAILED.`);
    process.exit(1);
  }

  console.log(`All ${results.length} checks passed.`);
  console.log('');
  console.log(`Sign in with the username "${operator.username}", not an email address.`);
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
