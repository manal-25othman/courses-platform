/**
 * Proves the connection the API will actually use, before a host depends on it.
 *
 * Migrations go on as the owner; the running application connects as
 * `app_user`, and that is a different string, a different role and — through
 * Supabase — a different route. None of it is exercised by applying the
 * migrations, so the first thing to find out whether it works would otherwise
 * be the first deploy, where the failure looks like the application being
 * broken rather than a connection string being wrong.
 *
 * Two things in particular are worth knowing in advance:
 *
 *   1. Supabase's pooler wants the project reference in the username, as
 *      `app_user.<project-ref>` rather than `app_user`. Custom roles through
 *      the pooler are a documented rough edge, so it is checked rather than
 *      assumed.
 *
 *   2. Transaction-mode pooling returns the connection to the pool between
 *      statements. The tenant scope is set with `set_config(…, true)` inside a
 *      transaction precisely so that is safe — but "should be safe" is not the
 *      same as "was tried", and if it is not, every request would silently see
 *      no rows.
 *
 * Both pooler ports live on the same host and differ only in mode, so one
 * string is enough: the other is derived and tried too, and the report says
 * which to use.
 *
 *   DATABASE_URL=… node tooling/deploy/runtime-connection.mjs
 */
import { PrismaClient } from '../prisma-client.mjs';

const TRANSACTION_PORT = '6543';
const SESSION_PORT = '5432';

/** Says where a connection points, never how to get in. */
function describe(url) {
  const value = url.trim();

  if (!/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error(
      'DATABASE_URL does not begin with postgresql:// . Copy the URI form from ' +
        "Supabase's Connect panel rather than a snippet for a language or tool.",
    );
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      'DATABASE_URL will not parse. A # or / in the password has to be percent-encoded: ' +
        '# becomes %23 and / becomes %2F.',
    );
  }

  if (/[[\]]/.test(parsed.username) || /%5B|%5D/i.test(parsed.password)) {
    throw new Error(
      "The connection string still contains Supabase's [YOUR-PASSWORD] placeholder.",
    );
  }

  // A host that is not a hostname means the string came apart somewhere, and
  // whatever landed there is usually part of the password. Catch it before a
  // connection attempt, and before it reaches a log.
  if (!/^[a-z0-9.-]+$/i.test(parsed.hostname) || !parsed.hostname.includes('.')) {
    throw new Error(
      'The host in DATABASE_URL is not a hostname, so the string is not the shape a ' +
        'connection URL takes. It should read:\n\n' +
        '  postgresql://app_user.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true\n\n' +
        'The usual cause is a character in the password that has to be percent-encoded — ' +
        '@ as %40, : as %3A, / as %2F, # as %23, ? as %3F — because an unencoded one ends ' +
        'the password early and the rest of it is read as the host.',
    );
  }

  if (!/\.supabase\.(com|co)$/i.test(parsed.hostname)) {
    throw new Error(
      `The host is "${parsed.hostname}", which is not a Supabase address. The pooled ` +
        'host ends in .pooler.supabase.com — copy the URI from Connect -> Session pooler ' +
        'or Transaction pooler rather than editing one by hand.',
    );
  }

  return {
    url: value,
    host: parsed.hostname,
    port: parsed.port || SESSION_PORT,
    database: parsed.pathname.replace(/^\//, '') || '(default)',
    user: parsed.username || '(unset)',
    pooled: /pooler\.supabase\.com$/i.test(parsed.hostname),
  };
}

function refuseIfNotProduction(where) {
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(where.host)) {
    return; // A local database is fine here: this test writes nothing.
  }
  if (/^(topgoal_dev|topgoal_test|topgoal_e2e|topgoal_check)$/.test(where.database)) {
    throw new Error(`Refusing to run against "${where.database}", a development database.`);
  }
}

/** The same host in the other pooling mode. */
function otherMode(where) {
  if (!where.pooled) return null;

  const url = new URL(where.url);
  const toSession = where.port === TRANSACTION_PORT;

  url.port = toSession ? SESSION_PORT : TRANSACTION_PORT;

  // `pgbouncer=true` disables prepared statements, which transaction mode needs
  // and session mode does not.
  if (toSession) url.searchParams.delete('pgbouncer');
  else url.searchParams.set('pgbouncer', 'true');

  return { ...describe(url.toString()), label: toSession ? 'session' : 'transaction' };
}

/**
 * Everything the API does to the database on an ordinary request, in order.
 *
 * Returns a list of {name, ok, detail}. A connection that cannot be made at
 * all returns a single failed entry rather than throwing, so the other mode
 * still gets tried.
 */
async function exercise(where) {
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });

  const db = new PrismaClient({ datasourceUrl: where.url });

  try {
    const [who] = await db.$queryRaw`
      SELECT current_user AS role,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)     AS super,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
    `;

    add('Connects', true, `as ${who.role}`);
    add(
      'Connects as app_user, not the owner',
      who.role === 'app_user',
      `current_user = ${who.role}`,
    );
    add(
      'The role cannot bypass row-level security',
      who.super === false && who.bypass === false,
      `superuser=${who.super}, bypassrls=${who.bypass}`,
    );

    // The API's own startup guard runs exactly this. If it would refuse to
    // start, better to know here than on the host.
    add(
      'The API startup guard would accept this connection',
      who.super === false && who.bypass === false,
    );

    // The shape of every scoped request: set the school inside a transaction,
    // then read under it. The value must survive to the next statement, which
    // is the thing transaction-mode pooling could break.
    const scope = '11111111-1111-1111-1111-111111111111';
    const [seen] = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_school_id', ${scope}, true)`;
      return tx.$queryRaw`SELECT current_setting('app.current_school_id', true) AS school`;
    });

    add(
      'Tenant scope survives inside one transaction',
      seen.school === scope,
      seen.school === scope ? 'set and read back' : `read back ${seen.school ?? 'nothing'}`,
    );

    // And must not survive out of it: that is what stops one school's scope
    // leaking onto the next request that reuses the connection.
    const [after] = await db.$queryRaw`
      SELECT current_setting('app.current_school_id', true) AS school
    `;
    add(
      'Tenant scope does not leak past the transaction',
      after.school === null || after.school === '',
      after.school ? `still set to ${after.school}` : 'cleared, as intended',
    );

    // Least privilege should hold through the pooler as it does directly.
    let ledgerDenied = false;
    try {
      await db.$queryRaw`SELECT count(*) FROM _prisma_migrations`;
    } catch {
      ledgerDenied = true;
    }
    add('The migration ledger stays out of reach', ledgerDenied);

    // A tenant table with no school set must return nothing rather than
    // everything: policies matching on an unset scope are the fail-closed case.
    const [rows] = await db.$queryRaw`SELECT count(*)::int AS n FROM schools`;
    add(
      'With no school set, tenant tables return nothing',
      rows.n === 0,
      `${rows.n} row(s) visible`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Prisma's message opens with "Invalid `prisma.$queryRaw()` invocation",
    // which says nothing. The cause is further down.
    const cause =
      message
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /authentication|password|reach|denied|does not exist|timed out|refused|SASL|Tenant|not found|error code/i.test(line)) ??
      message.split('\n').map((l) => l.trim()).filter(Boolean).pop() ??
      message;

    add('Connects', false, cause.slice(0, 200));
  } finally {
    await db.$disconnect().catch(() => {});
  }

  return results;
}

function report(label, where, results) {
  console.log(`\n${label} mode — ${where.host}:${where.port}, as ${where.user}`);
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`  ${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}`);
  return failed === 0;
}

async function main() {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    console.error('DATABASE_URL is not set. It should hold the connection the API will use:');
    console.error('the app_user role, through the pooler.');
    process.exit(2);
  }

  const given = describe(raw);
  refuseIfNotProduction(given);

  console.log('\nChecking the connection the running API will use.');
  console.log('Nothing is written, and the connection string is never printed.');

  const givenLabel = given.port === TRANSACTION_PORT ? 'Transaction' : 'Session';
  const primary = report(givenLabel, given, await exercise(given));

  const alternate = otherMode(given);
  let secondary = null;

  if (alternate) {
    const label = alternate.label === 'session' ? 'Session' : 'Transaction';
    secondary = report(label, alternate, await exercise(alternate));
  }

  console.log('');

  if (!primary && !secondary) {
    console.error('Neither pooling mode worked. The API cannot connect as it stands.');
    if (given.pooled && !/\./.test(given.user)) {
      console.error(
        `\nThe username is "${given.user}". Supabase's pooler wants the project reference ` +
          'appended, as app_user.<project-ref> — that is the usual cause.',
      );
    }
    process.exit(1);
  }

  if (primary) {
    console.log(`Use the ${givenLabel.toLowerCase()}-mode string for DATABASE_URL on the API host.`);
  } else {
    console.log(
      `The ${givenLabel.toLowerCase()}-mode string does not work, but the other one does. ` +
        `Use port ${alternate.port}${alternate.label === 'transaction' ? ' with ?pgbouncer=true' : ' without ?pgbouncer'}.`,
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
