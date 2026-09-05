# Production database setup

One run brings a new production database to the current migration and then
proves it landed correctly.

## From GitHub, with no clone (the usual way)

Actions -> **Production database** -> Run workflow, with `mode: check` first and
`mode: apply` + `confirm: APPLY` once the check looks right.

The connection string lives as the `PRODUCTION_DIRECT_URL` secret on the
`production` environment, so it is encrypted at rest, handed to one job, and
masked in the logs. It is never typed into a terminal, a file, or a message.
Add a required reviewer to that environment if an apply should need approval.

Note the sandbox an assistant runs in cannot do this: its egress policy allows
HTTPS through a proxy and nothing else, so PostgreSQL on 5432 and 6543 simply
times out. A runner has ordinary network access; that is why this lives here.

## From a machine with a clone

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File tooling\deploy\apply-production-migrations.ps1 -Check   # read-only
powershell -ExecutionPolicy Bypass -File tooling\deploy\apply-production-migrations.ps1          # apply
```

```bash
# macOS / Linux
read -rs -p 'Connection string: ' DIRECT_URL && export DIRECT_URL && echo
node tooling/deploy/production-database.mjs check
node tooling/deploy/production-database.mjs apply
```

The connection string is asked for, never stored. It reaches the deploy through
the environment of one process and is cleared when that process ends — no
`.env` file, and on Windows no `setx`, either of which would leave a production
password on the machine for everything else to read.

## Why not paste the SQL into a console

The 17 files are not self-contained. `least_privilege` opens by revoking
`app_user`'s access to `_prisma_migrations`, and that table exists only because
Prisma creates it. Run by hand, that file aborts on its first statement and the
rest of it never runs — which leaves the old `settings` policy in place, the one
that let any school change a global value for every school. Measured on two
databases built the two ways:

|                                | pasted by hand | `migrate deploy` |
| ------------------------------ | -------------- | ---------------- |
| `settings` policies            | `tenant_isolation` (the old one) | four scoped policies |
| `app_user` on `question_types` | `SELECT, INSERT, UPDATE, DELETE` | `SELECT` |
| policies                       | 31             | 34               |

The schema looks finished either way. That is the problem, and it is why the
script checks rather than assumes.

## What it refuses to do

- Run against `localhost`, `127.0.0.1` or `::1`.
- Run against a database named `topgoal_dev`, `topgoal_test`, `topgoal_e2e` or
  `topgoal_check`.
- Print the connection string, or any part of the password, in any output.

## What it checks afterwards

Fifteen assertions, each of which fails the run: all 17 migrations recorded, 25
tables, 34 policies, 11 `SECURITY DEFINER` functions, 22 tables under `FORCE`
row-level security with only the three intended exemptions, the four scoped
`settings` policies, `app_user` present and non-superuser and non-`BYPASSRLS`
and owning nothing, no `PUBLIC` grant on any table, no `app_user` grant on the
migration ledger, the registries read-only, and every tenant table empty.

A failure stops the run and names what is wrong.

## If the connection is refused

`P1001` on the Supabase **direct** connection almost always means it resolved to
IPv6 and the network is IPv4. The IPv4 add-on is Pro-and-above, so on the Free
plan the answer is the **Session pooler** string — port 5432, host
`aws-0-<region>.pooler.supabase.com`, user `postgres.<project-ref>`. Session
mode holds a dedicated connection, so DDL and Prisma's advisory lock both work.

Do not use the **Transaction pooler** on 6543 for migrations: it hands the
connection back between statements, which breaks that lock. Port 6543 is for the
running API.
