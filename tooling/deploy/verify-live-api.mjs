/**
 * Checks a deployed API from outside, the way a stranger would reach it.
 *
 * Everything here is an unauthenticated HTTP request to a public address, so it
 * needs no secret and can run anywhere with a network. That is the point: it
 * asks what the internet can see, which is a different question from what the
 * code intends, and the answer is only worth having from outside the process.
 *
 * Two of the strongest results are things that do NOT appear as requests.
 *
 *   The service is running at all. `assertConnectionIsRestricted` reads
 *   pg_roles at startup and throws unless the connected role is subject to
 *   row-level security, so a live port is proof that DATABASE_URL is not the
 *   owner. Had the migration credential been pasted into the runtime slot, the
 *   process would not have bound anything to answer on.
 *
 *   And it started with a JWT secret of real length, because the auth module
 *   refuses to construct without one.
 *
 *   API_BASE_URL=https://… node tooling/deploy/verify-live-api.mjs
 */
const BASE = (process.env.API_BASE_URL ?? '').replace(/\/+$/, '');

if (!BASE) {
  console.error('API_BASE_URL is not set. Give it the service root, without /api/v1.');
  process.exit(2);
}

const API = `${BASE}/api/v1`;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A free instance sleeps, so the first request pays for waking it. */
async function get(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    redirect: 'manual',
    ...init,
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

async function main() {
  console.log(`\nChecking the live API at ${BASE}\n`);
  console.log('Waking the service if it is asleep — a free instance can take a minute.\n');

  // --- It is up, and it can reach the database ---------------------------
  const health = await get('/health');
  let body = {};
  try {
    body = JSON.parse(health.text);
  } catch {
    /* reported by the checks below */
  }

  record('Health answers 200', health.status === 200, `status ${health.status}`);
  record('Reports itself healthy', body.status === 'ok', `status "${body.status}"`);
  record('Reports the database reachable', body.database === 'connected', `database "${body.database}"`);

  // A health endpoint is the one unauthenticated thing on the service, so it
  // is the first place a connection string would leak from.
  const leaked = /postgres|supabase|pooler|password|@|jwt|secret/i.test(health.text);
  record('Health discloses nothing about the connection', !leaked, health.text.slice(0, 80));

  // --- Nothing is readable without signing in ----------------------------
  const guarded = [
    '/admin/overview',
    '/school/teachers',
    '/school/students',
    '/students',
    '/content/units',
    '/content/overview',
    '/questions/types',
    '/learn/units',
    '/progress/class',
    '/teachers/me',
    '/messages/mine',
    '/auth/me',
  ];

  const open = [];
  for (const path of guarded) {
    const r = await get(path);
    if (r.status !== 401) open.push(`${path} → ${r.status}`);
  }
  record(
    'Every data route refuses an unauthenticated caller',
    open.length === 0,
    open.length === 0 ? `${guarded.length} routes, all 401` : open.join(', '),
  );

  // --- Nothing of the client's leaks in any of those answers -------------
  // Empty is expected today, but this is the check that would catch a route
  // answering with rows before a token is presented.
  const bodies = [];
  for (const path of guarded) bodies.push((await get(path)).text);
  const looksLikeData = bodies.some((t) => /"(id|username|schoolId|fullName|displayName)"\s*:/.test(t));
  record('No record fields appear in any refusal', !looksLikeData);

  // --- Sign-in tells a stranger nothing ----------------------------------
  const unknown = await get('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nobody-at-all', password: 'not-the-password' }),
  });
  const message = (() => {
    try {
      return JSON.parse(unknown.text).message ?? '';
    } catch {
      return unknown.text;
    }
  })();

  record('An unknown account is refused', unknown.status === 401, `status ${unknown.status}`);
  record(
    'The refusal does not say whether the account exists',
    /incorrect username or password/i.test(message),
    message.slice(0, 60),
  );

  // --- An address with nothing behind it looks like one ------------------
  const missing = await get('/there-is-nothing-here');
  record('An unknown route is 404, not an error', missing.status === 404, `status ${missing.status}`);

  // --- Errors carry nothing from inside ----------------------------------
  const internals = /at [A-Za-z]+\.|node_modules|PrismaClient|\/opt\/render|stack/i.test(
    `${missing.text}${unknown.text}`,
  );
  record('No stack trace, path or driver detail in any error', !internals);

  // --- Cross-origin is confined to one address ---------------------------
  const cors = await get('/health', { headers: { Origin: 'https://not-our-website.example' } });
  const allow = cors.headers.get('access-control-allow-origin');
  record(
    'A foreign origin is not echoed back',
    allow !== 'https://not-our-website.example' && allow !== '*',
    `allow-origin: ${allow ?? '(absent)'}`,
  );

  // --- One client cannot guess passwords freely --------------------------
  // Also the only way from outside to see that the proxy hop count is right:
  // the limit has to attach to the caller rather than to Render's router.
  let blockedAt = 0;
  for (let attempt = 1; attempt <= 14 && blockedAt === 0; attempt += 1) {
    const r = await get('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nobody-at-all', password: `guess-${attempt}` }),
    });
    if (r.status === 429) blockedAt = attempt;
  }
  record(
    'Repeated sign-in attempts are rate limited',
    blockedAt > 0,
    blockedAt > 0 ? `blocked at attempt ${blockedAt}` : 'never blocked in 14 attempts',
  );

  const failed = results.filter((r) => !r.ok);
  console.log('');

  if (failed.length > 0) {
    console.error(`${failed.length} of ${results.length} checks FAILED.`);
    process.exit(1);
  }

  console.log(`All ${results.length} checks passed. The deployed API is sound from outside.`);
  console.log('');
  console.log('Two things this proves without a request of their own:');
  console.log('  the runtime role is subject to row-level security, because the');
  console.log('  startup check refuses to bind a port otherwise; and a JWT secret');
  console.log('  of real length is set, because the auth module refuses without one.');
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
