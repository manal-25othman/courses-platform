/**
 * Brings a new production database up to the current migration, and proves it.
 *
 * The 17 migrations must go on through Prisma rather than by pasting them into
 * a SQL console. Prisma's ledger is not bookkeeping here: `least_privilege`
 * begins by revoking `app_user`'s access to `_prisma_migrations`, a table only
 * Prisma creates, so pasted by hand that file aborts and everything after its
 * first statement never runs — leaving the old `settings` policy in place,
 * which let any school change a global setting for every school. The database
 * looks finished and is not.
 *
 * So this script runs the deploy, and then checks the result against the shape
 * a correct chain produces rather than trusting that it worked.
 *
 * Usage — the connection string arrives in the environment, never on the
 * command line, so it stays out of shell history and process listings:
 *
 *   DIRECT_URL=… node tooling/deploy/production-database.mjs check
 *   DIRECT_URL=… node tooling/deploy/production-database.mjs apply
 *
 * `check` reads only: it reports what the database is and what is pending.
 * `apply` runs the deploy and then the same checks. Both refuse to touch a
 * database that looks like a development one.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '../prisma-client.mjs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const PRISMA_CLI = require.resolve('prisma/build/index.js');
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/api');

/** What a database built by all 17 migrations, and nothing else, looks like. */
const EXPECTED = {
  migrations: 17,
  tables: 25,
  policies: 34,
  securityDefinerFunctions: 11,
  forcedTables: 22,
  // The three that carry no policy on purpose: the migration ledger, and the
  // two token tables written before any school is known.
  withoutForcedRls: ['_prisma_migrations', 'password_reset_tokens', 'refresh_tokens'],
};

/** Tables that must be empty in a production database nobody has used yet. */
const TENANT_TABLES = [
  'schools',
  'users',
  'courses',
  'units',
  'unit_sections',
  'questions',
  'vocabulary_items',
  'activity_attempts',
  'media_assets',
];

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Says where a connection points without saying how to get in.
 *
 * Everything this script prints ends up in a terminal that somebody may later
 * screenshot or paste, so the password never appears in any output.
 */
function describe(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '') || '(default)',
      user: parsed.username || '(unset)',
    };
  } catch {
    throw new Error('DIRECT_URL is not a valid connection URL. Check for an unencoded character in the password: @ becomes %40, # becomes %23.');
  }
}

/**
 * Refuses to run against anything that looks like somebody's own machine.
 *
 * The failure this prevents is the expensive one: pointing a production
 * command at the development database and destroying work that is not backed
 * up anywhere.
 */
function refuseIfNotProduction(where) {
  const local = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

  if (local.includes(where.host)) {
    throw new Error(
      `Refusing to run: ${where.host} is a local database, not the production one. ` +
        'DIRECT_URL should point at the Supabase host.',
    );
  }

  if (/^(topgoal_dev|topgoal_test|topgoal_e2e|topgoal_check)$/.test(where.database)) {
    throw new Error(
      `Refusing to run: "${where.database}" is a development or test database. ` +
        'This script is only for the production one.',
    );
  }
}

function runPrisma(args, url) {
  return spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: API_DIR,
    // Passed explicitly rather than inherited, so a stray .env on the machine
    // cannot redirect this at a different database than the one checked above.
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });
}

async function verify(db) {
  console.log('\nChecking the result:\n');

  const [counts] = await db.$queryRaw`
    SELECT
      (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE')          AS tables,
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public')          AS policies,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef)                           AS secdef,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relforcerowsecurity)                                          AS forced
  `;

  const n = (v) => Number(v);
  const expect = (label, actual, wanted) =>
    record(label, n(actual) === wanted, `${n(actual)} (expected ${wanted})`);

  expect('All 17 migrations applied', counts.migrations, EXPECTED.migrations);
  expect('Tables created', counts.tables, EXPECTED.tables);
  expect('Row-level security policies', counts.policies, EXPECTED.policies);
  expect('SECURITY DEFINER functions', counts.secdef, EXPECTED.securityDefinerFunctions);
  expect('Tables under FORCE row-level security', counts.forced, EXPECTED.forcedTables);

  const unforced = await db.$queryRaw`
    SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relforcerowsecurity
    ORDER BY relname
  `;
  const actualUnforced = unforced.map((r) => r.relname);
  record(
    'Only the three expected tables are exempt',
    JSON.stringify(actualUnforced) === JSON.stringify(EXPECTED.withoutForcedRls),
    actualUnforced.join(', ') || 'none',
  );

  // The check that would have caught a hand-pasted chain: this policy replaced
  // one that let any school change a global setting for every school.
  const settings = await db.$queryRaw`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'settings' ORDER BY policyname
  `;
  const settingsPolicies = settings.map((r) => r.policyname);
  record(
    'Global settings are write-protected from a single school',
    settingsPolicies.length === 4 && !settingsPolicies.includes('tenant_isolation'),
    settingsPolicies.join(', '),
  );

  const [role] = await db.$queryRaw`
    SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
    FROM pg_roles WHERE rolname = 'app_user'
  `;
  record('The application role app_user exists', Boolean(role));
  if (role) {
    record(
      'app_user cannot bypass row-level security',
      role.rolsuper === false && role.rolbypassrls === false,
      `superuser=${role.rolsuper}, bypassrls=${role.rolbypassrls}`,
    );
    record(
      'app_user has no database or role creation rights',
      role.rolcreatedb === false && role.rolcreaterole === false,
    );
  }

  const [owned] = await db.$queryRaw`
    SELECT count(*) AS n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND r.rolname = 'app_user'
  `;
  record('app_user owns no table, so FORCE RLS applies to it', n(owned.n) === 0, `${n(owned.n)} owned`);

  const [pub] = await db.$queryRaw`
    SELECT count(*) AS n FROM information_schema.table_privileges
    WHERE grantee = 'PUBLIC' AND table_schema = 'public'
  `;
  record('No table is granted to PUBLIC', n(pub.n) === 0, `${n(pub.n)} grants`);

  const [ledger] = await db.$queryRaw`
    SELECT count(*) AS n FROM information_schema.table_privileges
    WHERE grantee = 'app_user' AND table_name = '_prisma_migrations'
  `;
  record('app_user cannot touch the migration ledger', n(ledger.n) === 0, `${n(ledger.n)} grants`);

  // The registries are read by everyone and changed by nobody at runtime, so
  // the grant should say the same thing the policy does.
  const writable = await db.$queryRaw`
    SELECT DISTINCT table_name FROM information_schema.table_privileges
    WHERE grantee = 'app_user'
      AND table_name IN ('question_types', 'section_types', 'bonus_game_types')
      AND privilege_type <> 'SELECT'
    ORDER BY table_name
  `;
  record(
    'app_user can read but not rewrite the question and section registries',
    writable.length === 0,
    writable.map((r) => r.table_name).join(', ') || 'read-only, as intended',
  );

  let occupied = [];
  for (const table of TENANT_TABLES) {
    const [row] = await db.$queryRawUnsafe(`SELECT count(*) AS n FROM "${table}"`);
    if (n(row.n) > 0) occupied.push(`${table}=${n(row.n)}`);
  }
  record(
    'No school, account or content exists yet',
    occupied.length === 0,
    occupied.join(', ') || 'every tenant table empty',
  );
}

async function main() {
  const mode = process.argv[2];

  if (mode !== 'check' && mode !== 'apply') {
    console.error('Usage: DIRECT_URL=… node tooling/deploy/production-database.mjs <check|apply>');
    process.exit(2);
  }

  const url = process.env.DIRECT_URL;

  if (!url) {
    console.error('DIRECT_URL is not set. Run this through tooling/deploy/apply-production-migrations.ps1,');
    console.error('which asks for the connection string without echoing it.');
    process.exit(2);
  }

  const where = describe(url);
  refuseIfNotProduction(where);

  console.log(`\nDatabase : ${where.database} on ${where.host}:${where.port}`);
  console.log(`Connecting as: ${where.user}`);
  console.log(`Mode     : ${mode === 'apply' ? 'APPLY MIGRATIONS' : 'read-only check'}\n`);

  const status = runPrisma(['migrate', 'status'], url);
  const statusText = `${status.stdout ?? ''}${status.stderr ?? ''}`;

  if (/P1001|Can't reach database server/.test(statusText)) {
    console.error('Cannot reach the database.\n');
    console.error('If this is the Supabase direct connection, the cause is almost certainly that');
    console.error('it resolves to IPv6 only and this network is IPv4. Use the Session pooler');
    console.error('string instead (port 5432, host aws-0-….pooler.supabase.com). Do not use the');
    console.error('Transaction pooler on 6543 — migrations need a session-level lock.');
    process.exit(1);
  }

  if (/P1000|[Aa]uthentication failed/.test(statusText)) {
    console.error('The database refused those credentials.\n');
    console.error('Two things cause this far more often than a wrong password:');
    console.error('  1. A character in the password was not percent-encoded in the URL.');
    console.error('     @ becomes %40, # becomes %23, / becomes %2F, : becomes %3A.');
    console.error(`  2. The Session pooler needs the user "postgres.<project-ref>", not "postgres".`);
    console.error(`     This connection is using "${where.user}".`);
    process.exit(1);
  }

  if (status.status !== 0 && !/migrations found/.test(statusText)) {
    console.error('Could not read the database state:\n');
    console.error(statusText.split('\n').filter((l) => !/^warn |pris\.ly/.test(l)).join('\n'));
    process.exit(1);
  }

  if (mode === 'check') {
    console.log(statusText.split('\n').filter((l) => !/^warn |pris\.ly|^$/.test(l)).join('\n'));
    process.exit(0);
  }

  console.log('Applying migrations…\n');
  const deploy = runPrisma(['migrate', 'deploy'], url);
  console.log(`${deploy.stdout ?? ''}${deploy.stderr ?? ''}`.split('\n').filter((l) => !/^warn |pris\.ly/.test(l)).join('\n'));

  if (deploy.status !== 0) {
    console.error('\nThe deploy did not finish. Nothing further was attempted.');
    process.exit(1);
  }

  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await verify(db);
  } finally {
    await db.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) FAILED. Do not continue to the next step.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} checks passed. The production database matches the approved schema.`);
  console.log('\nNext: give app_user a password, which is the only thing standing between');
  console.log('this database and a running API. That is the next step, not this one.');
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
