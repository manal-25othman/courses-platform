/**
 * Measures the production sign-in, and asks the production database what it
 * holds about usernames.
 *
 * Read-only, both halves. It signs in as the platform operator, whose password
 * the deployment already holds, and it writes nothing: no row is inserted,
 * updated or deleted, no account is renamed, no migration is applied, no
 * environment variable is touched. It prints no password, hash, token, e-mail
 * address or telephone number, and any username it has to show is masked.
 *
 * The one thing it cannot do is sign in as a pupil. Nobody has given this a
 * pupil's password and it must not create one, so the endpoints that only a
 * pupil may call are measured for what they cost to reach, and the cost of the
 * work behind them is derived from the per-statement latency measured here --
 * marked as derived wherever it appears.
 *
 *   SITE_URL=… API_URL=… DIRECT_URL=… PLATFORM_ADMIN_PASSWORD=…
 *   node tooling/deploy/diagnose-login.mjs
 */
import { PrismaClient } from '../prisma-client.mjs';

const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const apiDirect = (process.env.API_URL ?? '').replace(/\/+$/, '');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const username = process.env.PLATFORM_ADMIN_USERNAME?.trim() || 'operator';
// Trimmed for the same reason verify-operator-login.mjs trims it: a secret
// pasted with a newline is not what a person types.
const password = process.env.PLATFORM_ADMIN_PASSWORD?.trim();

if (!site || !url || !password) {
  console.error('SITE_URL, DIRECT_URL and PLATFORM_ADMIN_PASSWORD are required.');
  process.exit(2);
}

/** Enough of a name to recognise, never enough to use. */
const mask = (name) =>
  name.length <= 2
    ? '*'.repeat(name.length)
    : `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)}`;

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** One request, timed the way a browser experiences it. */
async function timed(label, target, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(target, { redirect: 'manual', ...init });
    const body = await response.arrayBuffer();
    const ms = Math.round(performance.now() - started);
    console.log(
      `  ${String(ms).padStart(6)} ms  HTTP ${response.status}  ${String(body.byteLength).padStart(7)} B  ${label}`,
    );
    return { ms, status: response.status, response, bytes: body.byteLength };
  } catch (caught) {
    const ms = Math.round(performance.now() - started);
    console.log(`  ${String(ms).padStart(6)} ms  FAILED                    ${label}  (${caught.message})`);
    return { ms, status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Asked first, because a refused request cannot be timed. The API carries a
// second limit besides the sign-in one: 100 requests a minute counted by
// address. Behind the website's proxy the API may see one address for
// everybody, and then that limit is 100 a minute for the whole school.
console.log('=== 0. is anything being refused before it is even answered? ===');
async function probe(label, target) {
  const started = performance.now();
  const response = await fetch(target).catch(() => null);
  const ms = Math.round(performance.now() - started);
  if (!response) {
    console.log(`  ${label}: unreachable`);
    return { status: 0, ms };
  }
  const interesting = ['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
  const headers = interesting
    .map((h) => (response.headers.get(h) ? `${h}=${response.headers.get(h)}` : null))
    .filter(Boolean)
    .join(' ');
  console.log(`  ${label}: HTTP ${response.status} in ${ms} ms${headers ? `  [${headers}]` : ''}`);
  return { status: response.status, ms };
}

const throughSite = await probe('/health through the website', `${site}/api/v1/health`);
const straightAtApi = apiDirect ? await probe('/health straight at the API', `${apiDirect}/api/v1/health`) : null;

if (throughSite.status === 429 || straightAtApi?.status === 429) {
  console.log('\n  The API is refusing requests with 429 (too many). This run has made');
  console.log('  only a handful, so the allowance it is spending is not its own:');
  console.log('  the count is shared. Waiting 65 seconds for the window to roll over.');
  await new Promise((r) => setTimeout(r, 65_000));
  const again = await probe('/health through the website, one minute later', `${site}/api/v1/health`);
  const againDirect = apiDirect
    ? await probe('/health straight at the API, one minute later', `${apiDirect}/api/v1/health`)
    : null;
  console.log(
    again.status === 429
      ? '  => still refused after a quiet minute: the allowance is being spent by other traffic'
      : '  => it recovered after a quiet minute: the window had simply been filled',
  );
  if (againDirect && again.status !== againDirect.status) {
    console.log(`  => through the website ${again.status}, straight at the API ${againDirect.status}:`);
    console.log('     the two are counted differently, which is what a shared bucket looks like');
  }
}

console.log('\n=== 1. is the API awake? a free Render instance sleeps when idle ===');
const first = await timed('the very first call to /health', `${site}/api/v1/health`);
const warmHealth = [];
for (let i = 0; i < 5; i += 1) {
  warmHealth.push((await timed(`/health again (${i + 1} of 5)`, `${site}/api/v1/health`)).ms);
}
const healthWarm = median(warmHealth);
console.log(`  first ${first.ms} ms, warm median ${healthWarm} ms`);
console.log(
  first.ms > healthWarm * 4 + 2000
    ? `  => the first call paid roughly ${first.ms - healthWarm} ms of cold start`
    : '  => the API was already awake when this ran; no cold start in this sample',
);

// ---------------------------------------------------------------------------
if (apiDirect) {
  console.log('\n=== 2. the proxy hop: browser -> website -> API, against the API alone ===');
  const viaSite = [];
  const viaApi = [];
  for (let i = 0; i < 3; i += 1) {
    viaSite.push((await timed('/health through the website', `${site}/api/v1/health`)).ms);
    viaApi.push((await timed('/health straight at the API', `${apiDirect}/api/v1/health`)).ms);
  }
  console.log(`  through the website: ${median(viaSite)} ms;  straight at the API: ${median(viaApi)} ms`);
  console.log(`  => the hop costs about ${median(viaSite) - median(viaApi)} ms per call`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 3. loading the sign-in page ===');
const page = await timed('GET /login (html)', `${site}/login`);
const html = page.status === 200 ? await (await fetch(`${site}/login`)).text() : '';
const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
let assetMs = 0;
let assetBytes = 0;
for (const path of refs.slice(0, 20)) {
  const got = await timed(`  asset …${path.slice(-30)}`, `${site}${path}`);
  assetMs += got.ms;
  assetBytes += got.bytes ?? 0;
}
console.log(`  ${refs.length} assets referenced; ${Math.round(assetBytes / 1024)} KB, ${assetMs} ms serially`);

// ---------------------------------------------------------------------------
console.log('\n=== 4. signing in ===');
const loginBody = JSON.stringify({ username, password });
const jsonHeaders = { 'content-type': 'application/json' };
const login = await timed('POST /auth/login', `${site}/api/v1/auth/login`, {
  method: 'POST',
  headers: jsonHeaders,
  body: loginBody,
});
const setCookie = login.response?.headers.get('set-cookie') ?? '';
const jar = setCookie
  .split(/,(?=[^;]+=)/)
  .map((c) => c.split(';')[0].trim())
  .filter(Boolean)
  .join('; ');
console.log(`  session established in the same response: ${jar ? `${jar.split(';').length} cookie(s)` : 'none'}`);

let perStatement = null;
if (login.status === 200 && jar) {
  const cookie = { cookie: jar };
  console.log('\n=== 5. what a page asks for once it is signed in ===');
  const meRuns = [];
  for (let i = 0; i < 3; i += 1) meRuns.push((await timed('GET /auth/me', `${site}/api/v1/auth/me`, { headers: cookie })).ms);
  const me = median(meRuns);
  const mine = await timed('GET /teachers/mine (refused for a non-pupil, so: reach only)', `${site}/api/v1/teachers/mine`, { headers: cookie });
  const units = await timed('GET /learn/units (refused for a non-pupil, so: reach only)', `${site}/api/v1/learn/units`, { headers: cookie });
  const inbox = await timed('GET /messages/inbox', `${site}/api/v1/messages/inbox`, { headers: cookie });

  // /auth/me costs 10 SQL statements, counted with statement logging on an
  // identical local build. /health costs none. The difference over ten is what
  // one statement costs between the API and the database in production.
  perStatement = (me - healthWarm) / 10;
  console.log(`\n  /health (no database) ${healthWarm} ms vs /auth/me (10 statements) ${me} ms`);
  console.log(`  => one database statement costs about ${perStatement.toFixed(1)} ms from the API`);
  console.log(`  a pupil's /learn/units issues 132 statements (counted locally, same code):`);
  console.log(`  => derived cost of that one screen: ${Math.round(healthWarm + 132 * perStatement)} ms`);
  console.log(`     (${units.status === 403 ? 'the endpoint itself refused this account, as it should' : `it answered ${units.status}`})`);
  console.log(`  reach-only times — /teachers/mine ${mine.ms} ms, /learn/units ${units.ms} ms, /messages/inbox ${inbox.ms} ms`);

  await fetch(`${site}/api/v1/auth/logout`, { method: 'POST', headers: cookie }).catch(() => {});
} else {
  console.log('  could not sign in; the signed-in measurements were skipped');
}

// ---------------------------------------------------------------------------
console.log('\n=== 6. the production database, read only ===');
const db = new PrismaClient({ datasourceUrl: url });
try {
  const applied = await db.$queryRawUnsafe(
    `SELECT migration_name, finished_at, rolled_back_at
       FROM _prisma_migrations ORDER BY started_at DESC LIMIT 6`,
  );
  console.log('  the most recent migrations this database has:');
  for (const row of applied) {
    const state = row.rolled_back_at ? 'ROLLED BACK' : row.finished_at ? 'applied' : 'UNFINISHED';
    console.log(`    ${row.migration_name}  ${state}`);
  }

  const wanted = '20260920000000_case_insensitive_usernames';
  const found = await db.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM _prisma_migrations
      WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    wanted,
  );
  console.log(`  ${wanted}: ${found[0].n > 0 ? 'APPLIED' : 'NOT APPLIED'}`);

  const def = await db.$queryRawUnsafe(
    `SELECT pg_get_functiondef('auth_find_users_by_username(text,uuid)'::regprocedure) AS src`,
  );
  const where = def[0].src.split('\n').find((line) => /WHERE/i.test(line))?.trim();
  const insensitive = /lower\s*\(\s*username\s*\)/i.test(def[0].src);
  console.log(`  the sign-in lookup matches on: ${where ?? '(no WHERE found)'}`);
  console.log(`  => ${insensitive ? 'case-INSENSITIVE' : 'case-SENSITIVE — this is the regression'}`);

  const idx = await db.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'users' ORDER BY indexname`,
  );
  console.log(`  indexes on users: ${idx.map((r) => r.indexname).join(', ')}`);

  // The question itself, asked of the live data and changing none of it.
  const sample = await db.$queryRawUnsafe(
    `SELECT username FROM users
      WHERE deleted_at IS NULL AND username ~ '[a-z]' ORDER BY created_at LIMIT 1`,
  );
  if (sample.length) {
    const name = sample[0].username;
    const asStored = await db.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM auth_find_users_by_username($1, NULL)`, name);
    const shouted = await db.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM auth_find_users_by_username($1, NULL)`, name.toUpperCase());
    console.log(`  live lookup for ${mask(name)} as stored: ${asStored[0].n} row(s); in capitals: ${shouted[0].n} row(s)`);
  }

  console.log('\n  --- the collision check, before anything is ever applied ---');
  const clashes = await db.$queryRawUnsafe(
    `SELECT coalesce(school_id::text, '(platform)') AS scope,
            lower(username) AS name,
            count(*)::int   AS accounts
       FROM users
      WHERE deleted_at IS NULL
      GROUP BY 1, 2
     HAVING count(*) > 1
      ORDER BY 3 DESC`,
  );
  if (clashes.length === 0) {
    console.log('  no two live accounts differ only in capitals.');
    console.log('  => the case-insensitive migration would be safe to apply.');
  } else {
    console.log(`  ${clashes.length} collision(s) — the migration must NOT be applied until they are resolved:`);
    for (const row of clashes) console.log(`    ${mask(row.name)} is held by ${row.accounts} accounts in ${row.scope}`);
  }

  const users = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL`);
  console.log(`  live accounts on the platform: ${users[0].n}`);
} finally {
  await db.$disconnect();
}
console.log('\nNothing above wrote to production.');
