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


## Deploying the API to Render

`render.yaml` at the repository root declares the service, so Render builds it
from the repository rather than from a form. In Render: **New -> Blueprint**,
point it at this repository, and fill in the values it asks for. Everything
else — plan, region, build and start commands, health check path — is already
in the file.

Two things about this monorepo decide those commands. It is one npm workspace,
so `npm ci` has to run at the root even though the service lives in `apps/api`;
a build rooted at `apps/api` resolves nothing. And the web app is a separate
service on a separate host, so it is deliberately not built here.

| Setting | Value | Why |
| --- | --- | --- |
| Root directory | `.` | The workspaces are declared at the root |
| Build | `npm ci --include=dev && npm run build -w @courses/api` | `--include=dev` because Render applies `NODE_ENV=production` to the build, which would otherwise omit `@nestjs/cli`; builds only the API, since `npm run build` would also build Next.js and throw it away |
| Start | `node apps/api/dist/main.js` | Resolves the Prisma client from `apps/api/node_modules` |
| Health check | `/api/v1/health` | Public, and says nothing about the data |
| Node | 22, from `.node-version` | Without the pin, Render picks its own default |
| Region | Frankfurt | Beside the Supabase project; the chatty traffic is API-to-database |

`PORT` is assigned by Render and read first by `main.ts`. `API_PORT` remains for
local use. A service that ignores `PORT` binds where nothing is listening, and
the deploy fails its health check for reasons that look nothing like the cause.

### The two roles, on the host

`DATABASE_URL` is `app_user` through the **transaction pooler** on 6543 with
`?pgbouncer=true`. `DIRECT_URL` is the owner through the **session pooler** on
5432, and the running API never uses it — Prisma reads it only for migrations.
Pointing `DATABASE_URL` at the owner does not quietly work: the startup check
refuses to boot, which is the point of it.

Never set `ALLOW_UNRESTRICTED_DB` on a deployed service. It exists for a local
database and it turns that check off.

### Why the build needs `--include=dev`

Render applies the service's `NODE_ENV` to the build as well as the run, and
`npm ci` under `NODE_ENV=production` omits devDependencies. `@nestjs/cli` is one,
so `nest build` is not installed and the build stops with `nest: not found`.

It fails asymmetrically, which is what makes it confusing to read: the lockfile
marks `prisma` and `typescript` as production dependencies, because something
outside devDependencies pulls them in. So `prisma generate` succeeds and only
`nest build` is missing, which looks like a problem with Nest rather than with
the install.

`--include=dev` says that a build needs its build tools regardless of NODE_ENV.
The alternative — moving `@nestjs/cli` into dependencies — would ship a compiler
to production to work around an install flag, and installing the CLI globally
would make the build depend on something outside the repository.

### Checking the deployment from outside

Actions -> **Verify the live API** -> Run workflow, with the service root
(`https://smart-shift-api.onrender.com`, no `/api/v1`). It needs no secret,
because every request it makes is one a stranger could make.

Twelve checks: health answers and says the database is reachable and discloses
nothing about the connection; twelve data routes all refuse an unauthenticated
caller, and no record field appears in any refusal; an unknown account is
refused without revealing whether it exists; an unknown address is a 404 rather
than an error; no stack trace, path or driver detail appears anywhere; a foreign
origin is not echoed back; and repeated sign-in attempts are rate limited, which
from outside is the only way to see that the proxy hop count is right — the
limit has to attach to the caller and not to Render's router.

Two results arrive without a request of their own. The service answering at all
means `DATABASE_URL` holds a role that row-level security applies to, because
the startup check reads `pg_roles` and refuses to bind a port otherwise; and it
means a JWT secret of real length is set, because the auth module refuses to
construct without one. A migration credential pasted into the runtime slot would
not produce a service to talk to.

The first request pays for waking a sleeping free instance, so the script allows
90 seconds for it.
