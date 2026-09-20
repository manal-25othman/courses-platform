/**
 * Brings a new production database up to the current migration, and proves it.
 *
 * The 18 migrations must go on through Prisma rather than by pasting them into
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
import { appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { PrismaClient } from '../prisma-client.mjs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const PRISMA_CLI = require.resolve('prisma/build/index.js');
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/api');

/**
 * The SHAPE every production database must have, whatever it holds.
 *
 * These are structural facts — tables, policies, functions — and they are as
 * true of a live database with four schools in it as of an empty one on its
 * first day. Nothing here says anything about content; that is deliberate.
 */
/**
 * How many migrations this repository contains.
 *
 * Counted, not written down. The number was hardcoded and went stale twice:
 * once at 17, when Grammar Adventure's migration existed and production had
 * never run it, and again at 18, when the case-insensitive username migration
 * applied perfectly and the run went red for finding one migration too *many*.
 * A number a human has to remember to bump is a number that will be wrong, and
 * the second failure is the worse kind — it cries wolf over a good deploy, and
 * a check nobody believes is a check nobody reads.
 *
 * Every directory here is a migration Prisma will apply, so the directory
 * listing is the same fact the ledger should agree with. Comparing the two
 * still catches a database left behind — applied < present, the Grammar
 * Adventure case — and now also catches a database that has had something
 * applied to it from outside this repository.
 */
function migrationsInRepository() {
  const dir = join(API_DIR, 'prisma', 'migrations');

  if (!existsSync(dir)) {
    throw new Error(`No migrations directory at ${dir} — is this the repository root?`);
  }

  const found = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'migration.sql')))
    .length;

  // A repository with no migrations cannot be right, and would otherwise make
  // "0 applied" look like a pass against an empty database.
  if (found === 0) {
    throw new Error(`No migrations found in ${dir}.`);
  }

  return found;
}

const EXPECTED = {
  migrations: migrationsInRepository(),
  tables: 25,
  policies: 34,
  securityDefinerFunctions: 11,
  forcedTables: 22,
  // The three that carry no policy on purpose: the migration ledger, and the
  // two token tables written before any school is known.
  withoutForcedRls: ['_prisma_migrations', 'password_reset_tokens', 'refresh_tokens'],
};

/**
 * The tables that hold a school's own work.
 *
 * They used to be checked for being empty, which was true on the day this
 * script was written and false ever after. They are now counted before and
 * after a migration, and the count may only go up: what matters on a live
 * database is not that it is empty but that a migration did not take anything
 * away.
 */
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

/**
 * How many rows each tenant table holds right now.
 *
 * Tolerates a table that does not exist yet, because this is taken before the
 * migrations run as well as after: on a database's first day there is nothing
 * to count, and that is not a fault.
 */
async function census(db) {
  const counts = new Map();
  const unreadable = [];

  for (const table of TENANT_TABLES) {
    try {
      const [row] = await db.$queryRawUnsafe(`SELECT count(*) AS n FROM "${table}"`);
      counts.set(table, Number(row.n));
    } catch {
      unreadable.push(table);
    }
  }

  return { counts, unreadable };
}

/** "schools=4, users=10, …", or a plain word when there is nothing to say. */
function describeCensus({ counts }) {
  const held = [...counts].filter(([, n]) => n > 0);
  return held.length === 0
    ? 'every tenant table empty'
    : held.map(([table, n]) => `${table}=${n}`).join(', ');
}
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
  const value = url.trim();

  // Checked before parsing, not after. `new URL` happily reads
  // "postgres.abc:pass@host/db" as the scheme "postgres.abc:" and puts the
  // password in the path, which this function would then have printed.
  if (/^psql\s/i.test(value)) {
    throw new Error(
      'That is the psql command line, not a connection URL. In Supabase\'s Connect ' +
        'panel, switch the format from "psql" to "URI" — it is the one that starts ' +
        'postgresql:// — and copy that instead.',
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error(
      'The connection string does not begin with postgresql:// . Copy the URI form ' +
        'from Supabase\'s Connect panel rather than a snippet for a language or tool.',
    );
  }

  try {
    const parsed = new URL(value);

    // Parses, but Supabase's placeholder is still in it. Worth catching here
    // rather than as a puzzling authentication failure later.
    if (/[[\]]/.test(parsed.username) || /%5B|%5D/i.test(parsed.password)) {
      throw new Error(
        'The connection string still contains Supabase\'s [YOUR-PASSWORD] placeholder. ' +
          'Replace those brackets and the text between them with the database password.',
      );
    }

    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '') || '(default)',
      user: parsed.username || '(unset)',
    };
  } catch (caught) {
    if (caught instanceof Error && caught.message.startsWith('The connection string')) {
      throw caught;
    }

    // The shape is already known good, so a parse failure leaves one cause.
    throw new Error(
      'The password contains a # or a / , which have to be percent-encoded before a ' +
        'connection URL can be read: # becomes %23 and / becomes %2F. Encode those two ' +
        '(and @ as %40, : as %3A if present) and save the secret again.',
    );
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

async function verify(db, before, after) {
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

  expect(`All ${EXPECTED.migrations} migrations applied`, counts.migrations, EXPECTED.migrations);
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

  /*
    What a live database needs asked of it.

    This used to assert that no school, account or content existed — true on
    the morning it was written, and false from the first school onwards. It
    failed run #13 with "schools=4, users=10, …", which is not a fault: it is
    the client's real work, and the run should have been green.

    Three questions replace it, and all three are worth asking of a database
    that is in use:

      1. Is every tenant table still readable? A migration that drops or
         renames one is caught here, before anybody's screen goes blank.
      2. Did anything disappear? The census taken before the migration is
         compared with the one after, and a count may only go up. This is the
         assertion that actually protects the client's content.
      3. What is in there? Reported, never judged.
  */
  record(
    'Every tenant table is still readable',
    after.unreadable.length === 0,
    after.unreadable.length === 0
      ? `${TENANT_TABLES.length} tables queried`
      : `UNREADABLE: ${after.unreadable.join(', ')}`,
  );

  const lost = [];
  for (const [table, count] of after.counts) {
    const was = before.counts.get(table);
    if (was !== undefined && count < was) lost.push(`${table} ${was} -> ${count}`);
  }
  record(
    'The migration removed no existing school, account or content',
    lost.length === 0,
    lost.length === 0
      ? 'nothing lost'
      : `ROWS DISAPPEARED: ${lost.join(', ')}`,
  );

  console.log(`\n  DATA  ${describeCensus(after)}`);

  /*
    The games a student is offered are rows, not code. A migration count says
    the ledger moved; it does not say the row that makes a game exist actually
    landed — and a game whose row is missing looks exactly like a game that was
    never written. So each registry row this release depends on is named and
    checked: key, pool, minimum and active state.

    Add a row here whenever a game is added. It is three lines, and it is the
    difference between "18 migrations applied" and "the students can see it".
  */
  const EXPECTED_GAMES = [
    { key: 'memory_match', pool: 'vocabulary', minimum: 6 },
    { key: 'quick_match', pool: 'vocabulary', minimum: 4 },
    { key: 'grammar_adventure', pool: 'grammar_questions', minimum: 3 },
  ];

  const games = await db.$queryRaw`
    SELECT key, content_pool, minimum_items, is_active FROM bonus_game_types
  `;
  const bySlug = new Map(games.map((g) => [g.key, g]));

  for (const want of EXPECTED_GAMES) {
    const got = bySlug.get(want.key);
    const ok =
      got !== undefined &&
      got.content_pool === want.pool &&
      n(got.minimum_items) === want.minimum &&
      got.is_active === true;
    record(
      `Game "${want.key}" is registered and active`,
      ok,
      got === undefined
        ? 'MISSING — students will not see this game'
        : `pool ${got.content_pool}, minimum ${n(got.minimum_items)}, ${got.is_active ? 'active' : 'INACTIVE'}`,
    );
  }
}

/**
 * Usernames that differ only in capitals, within one school.
 *
 * Read-only, and the reason the case-insensitive migration is not simply
 * applied. Once two names collide, making sign-in case-insensitive finds two
 * rows for either spelling -- and the sign-in path reads two rows as "that
 * name is ambiguous" and refuses. Applying it blind would lock out both
 * girls rather than neither.
 *
 * Which of two real people keeps a name is the school's decision, so nothing
 * here renames, merges or deletes anything. It reports and stops.
 *
 * It names the spellings and roles, because that is what somebody needs in
 * order to decide, and nothing else -- no e-mail address, no full name, no
 * password state. A collision report is not a reason to export a user list.
 */
async function usernameCollisions(db) {
  return db.$queryRawUnsafe(`
    SELECT
      coalesce(s.name, '(platform — no school)') AS school,
      lower(u.username)                          AS clashing_name,
      count(*)                                   AS accounts,
      string_agg(u.username || ' (' || u.role || ')', ', ' ORDER BY u.username) AS spellings
    FROM users u
    -- LEFT, not INNER: the platform operator belongs to no school, and two
    -- operators sharing a name lock out the very person who would fix it.
    LEFT JOIN schools s ON s.id = u.school_id
    WHERE u.deleted_at IS NULL
    GROUP BY s.name, u.school_id, lower(u.username)
    HAVING count(*) > 1
    ORDER BY 1, 2
  `);
}

async function main() {
  const mode = process.argv[2];

  if (mode !== 'check' && mode !== 'apply' && mode !== 'usernames') {
    console.error(
      'Usage: DIRECT_URL=… node tooling/deploy/production-database.mjs <check|apply|usernames>',
    );
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
  console.log(
    `Mode     : ${
      mode === 'apply'
        ? 'APPLY MIGRATIONS'
        : mode === 'usernames'
          ? 'read-only username collision check'
          : 'read-only check'
    }\n`,
  );

  /*
    Answered before anything else and on its own. It touches no migration and
    needs none applied, which is the point: it is what tells you whether the
    case-insensitive migration is safe to apply at all.
  */
  if (mode === 'usernames') {
    const db = new PrismaClient({ datasourceUrl: url });
    try {
      const clashes = await usernameCollisions(db);

      if (clashes.length === 0) {
        console.log('No username collisions. Two accounts differing only in capitals: none.');
        console.log('The case-insensitive migration can be applied safely.');
        await db.$disconnect();
        return;
      }

      console.error(`${clashes.length} username collision(s) found.\n`);
      for (const row of clashes) {
        console.error(`  ${row.school} — "${row.clashing_name}" is held by ${row.accounts}:`);
        console.error(`      ${row.spellings}`);
      }
      console.error('\nThe migration will refuse to apply while these exist, which is correct:');
      console.error('making sign-in case-insensitive now would find two accounts for either');
      console.error('spelling and lock out BOTH of them, not neither.\n');
      console.error('Nothing has been changed. Renaming one of each pair is a decision about');
      console.error('real people and belongs to the school, not to this script.');
      await db.$disconnect();
      process.exit(1);
    } catch (error) {
      await db.$disconnect().catch(() => undefined);
      throw error;
    }
  }

  const status = runPrisma(['migrate', 'status'], url);
  const statusText = `${status.stdout ?? ''}${status.stderr ?? ''}`;

  if (/P1001|Can't reach database server/.test(statusText)) {
    console.error('Cannot reach the database.\n');

    // Worth naming exactly rather than hinting: the direct and pooled strings
    // differ by two easily-missed characters, and Supabase's Connect panel
    // opens on the direct one.
    const direct = /^db\..+\.supabase\.co$/.test(where.host);

    if (direct) {
      const ref = where.host.split('.')[1];
      console.error('This is the DIRECT connection string, which resolves to IPv6 only. This');
      console.error('network is IPv4, and the IPv4 add-on is Pro-and-above, so it cannot work');
      console.error('here. Use the SESSION POOLER string instead. In Supabase: Connect ->');
      console.error('Connection String -> Session pooler. It differs in two places:\n');
      console.error(`  user  postgres            ->  postgres.${ref}`);
      console.error(`  host  ${where.host}  ->  aws-0-<region>.pooler.supabase.com\n`);
      console.error('Not the Transaction pooler on 6543: it hands the connection back between');
      console.error('statements, which breaks the session-level lock migrations take.');
    } else {
      console.error('Check the host and port are reachable from here. For Supabase, the string');
      console.error('that works from an IPv4 network is the Session pooler on port 5432, host');
      console.error('aws-0-<region>.pooler.supabase.com, user postgres.<project-ref>. Not the');
      console.error('Transaction pooler on 6543 — migrations need a session-level lock.');
    }

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

  const pending = /have not yet been applied/i.test(statusText);

  if (mode === 'check') {
    console.log(statusText.split('\n').filter((l) => !/^warn |pris\.ly|^$/.test(l)).join('\n'));

    /*
      A read-only check that finds production behind and then reports success
      is how Grammar Adventure stayed invisible after somebody had already
      "run the migration workflow, green". The run did exactly what it was
      asked — it looked, and it found the migration unapplied — and the green
      tick said the opposite of what the log said.

      Green now means one thing: production is up to date. Behind is a
      failure, whatever mode found it.
    */
    if (pending) {
      console.error('\nProduction is BEHIND. The migrations listed above have not been applied.');
      console.error('Nothing was changed — this mode only looks.');
      console.error('\nTo apply them: re-run this workflow with mode=apply and confirm=APPLY.');
      await summarise(
        '❌ Production is behind',
        'The migrations named in the log are not applied. Nothing was changed.',
        'Re-run this workflow with **mode: apply** and **confirm: APPLY**.',
      );
      process.exit(1);
    }

    console.log('\nProduction is up to date. Nothing to apply.');
    await summarise('✅ Production is up to date', 'Every migration in the repository is applied.', '');
    process.exit(0);
  }

  /*
    Count the client's work BEFORE touching anything, so that afterwards there
    is something to compare against. A migration that quietly removed rows
    would otherwise be indistinguishable from one that did not.
  */
  const beforeDb = new PrismaClient({ datasourceUrl: url });
  let before;
  try {
    before = await census(beforeDb);
    console.log(`Before   : ${describeCensus(before)}\n`);
  } finally {
    await beforeDb.$disconnect();
  }

  console.log('Applying migrations…\n');
  const deploy = runPrisma(['migrate', 'deploy'], url);
  console.log(`${deploy.stdout ?? ''}${deploy.stderr ?? ''}`.split('\n').filter((l) => !/^warn |pris\.ly/.test(l)).join('\n'));

  if (deploy.status !== 0) {
    console.error('\nThe deploy did not finish. Nothing further was attempted.');
    process.exit(1);
  }

  const db = new PrismaClient({ datasourceUrl: url });
  let after;
  try {
    after = await census(db);
    await verify(db, before, after);
  } finally {
    await db.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) FAILED. Do not continue to the next step.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} checks passed. The production database matches the approved schema.`);
  await summarise(
    '✅ Migrations applied and verified',
    `All ${results.length} checks passed, including the bonus-game registry.\n\n`
      + `Data in the database: ${describeCensus(after)}. Nothing was removed.`,
    '',
  );
}

/**
 * A line on the run's own summary page.
 *
 * The log said "have not yet been applied" and the run still showed a green
 * tick; nobody reads forty lines of Prisma output to find that out. This puts
 * the verdict where the tick is.
 */
async function summarise(heading, detail, next) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const body = [`### ${heading}`, '', detail, next ? `\n**Next:** ${next}` : ''].join('\n');
  await appendFile(file, `${body}\n`);
}

/*
  Run when executed, stay quiet when imported.

  The guard below refuses to touch anything but the production database, which
  is right, and it also meant none of this could be exercised against a test
  database. Splitting "being run" from "being imported" lets the counting and
  comparison be tested for real, without the guard being softened by a flag
  that could one day be set by accident.
*/
const executedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executedDirectly) {
  main().catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { census, describeCensus, TENANT_TABLES };
