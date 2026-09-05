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

Thirteen checks: health answers and says the database is reachable and
discloses nothing about the connection; twelve data routes all refuse an
unauthenticated caller, and no record field appears in any refusal; an unknown
account is refused without revealing whether it exists; an unknown address is a
404 rather than an error; no stack trace, path or driver detail appears
anywhere; a foreign origin is not echoed back; a forged `X-Forwarded-For` does
not buy a fresh sign-in allowance; and repeated sign-in attempts are rate
limited.

Two results arrive without a request of their own. The service answering at all
means `DATABASE_URL` holds a role that row-level security applies to, because
the startup check reads `pg_roles` and refuses to bind a port otherwise; and it
means a JWT secret of real length is set, because the auth module refuses to
construct without one. A migration credential pasted into the runtime slot would
not produce a service to talk to.

The first request pays for waking a sleeping free instance, so the script allows
90 seconds for it.

#### Why the sign-in limit is checked twice

The limit's two ways of being wrong look identical from outside, and only one of
them is about the limit. It can count the wrong address — one belonging to the
proxy layer, which changes per request, so nobody ever exhausts an allowance —
or it can count an address out of the request's own headers, where a caller can
put a new one each time. `TRUSTED_PROXY_HOPS` decides which, and either mistake
leaves a limit that is only the appearance of one.

So the forged-address check runs first and reads the counter rather than the
refusal: a caller the service has not seen starts at the full allowance, and six
invented addresses that each start there mean the header is choosing.

The second check spends enough attempts for several addresses to exhaust their
own allowance, in waves so they land inside the minute the limit is measured
over. That is not over-testing. The first live run failed on fourteen sequential
attempts, and the counter came back `9, 8, 8, 7, 7, 6, 5, 4, 6, 3, 5, 4, 3, 2` —
two allowances running down side by side. The cause was the prober, not the
service: a GitHub runner leaves by more than one address, each counted
separately and correctly. Sixteen attempts in waves blocked at the thirteenth,
and the forged addresses bought nothing. One hop is right for Render.

## Deploying the website to Vercel

There is no configuration file for this one, and that is deliberate: the web app
is an ordinary Next.js app in a workspace, and Vercel reads both without being
told. Five settings in the New Project form are the whole deployment.

| Setting | Value | Why |
| --- | --- | --- |
| Root directory | `apps/web` | Vercel installs from the repository root when it sees the workspaces, and builds here |
| Framework | Next.js (detected) | Nothing to override |
| Production branch | the repository's default branch | Already the branch this work lives on |
| `NEXT_PUBLIC_API_URL` | `/api/v1` | A path, not an address: the browser asks the website it is already on |
| `API_ORIGIN` | `https://smart-shift-api.onrender.com` | Where the website forwards those requests. No trailing slash, no `/api/v1` |

Both variables have to exist **before the first build**, not after it. Next.js
writes `NEXT_PUBLIC_API_URL` into the JavaScript the browser downloads, and it
compiles the rewrite destination into the routing manifest — a build that ran
without them ships a bundle pointing at `http://localhost:3001` and no proxy at
all, which fails in a way that looks like the API being down rather than the
website being built wrong.

Every page carries `use client` and nothing fetches on the server, so Vercel is
serving files and the browser does all the talking. Verified from a clean
install with devDependencies omitted, which is the harshest thing a host does:
the build needs no `--include=dev`, unlike the API's.

### Why the website carries the API's address

The API's tokens are `SameSite=Lax` cookies and the website sends them with
`credentials: 'include'`. A browser will not store a `Lax` cookie that arrives
from a different site, and `x.vercel.app` and `y.onrender.com` are different
sites — different registrable domains, not merely different hosts. Signing in
would return 200, set nothing, and leave every screen behaving as though nobody
had signed in. Nothing in the response says so; the browser drops the cookie
silently, and no amount of CORS configuration reaches it, because `SameSite` is
a separate rule from the cross-origin one.

So `next.config.ts` rewrites `/api/v1/*` to `API_ORIGIN`, and the browser only
ever talks to the website's own address. The cookie comes back from the origin
the browser is already on, and it stays `Lax` — which is the point of doing it
this way rather than sending `SameSite=None`, which would give up the
cross-site protection `Lax` exists for.

Measured through a real production build rather than assumed: `Set-Cookie`
passes through the rewrite untouched and lands on the website's host; a stored
JPEG comes back byte for byte with its own content type; a request for another
school's file still answers 404; and sign-in, an authenticated read, renewal at
the fifteen-minute mark, replay refusal, and sign-out all behave as they do
without the proxy.

### What it costs, and what was done about it

Behind the proxy the API sees one address for the whole school, because that is
what a proxy is. An address-counted sign-in limit would then be ten attempts a
minute shared by everyone, and a class signing in together would lock itself
out on the eleventh girl.

So the limit counts attempts **against the account** they are aimed at, which is
what guessing a password actually means, with a coarse per-address limit of a
hundred a minute underneath it. Measured through the proxy: twelve guesses at
one account, each carrying a different invented `X-Forwarded-For`, were refused
from the eleventh onwards, and a classmate signing in at that same moment from
that same address was let straight through.

That also removes this limit's dependence on `TRUSTED_PROXY_HOPS` being right,
which is a property of the hosting rather than of the code and changes silently
whenever something is put in front of the API.

### Attaching a domain later

Nothing here has to be undone. Attach `app.<domain>` to Vercel and
`api.<domain>` to Render, then remove `API_ORIGIN` and set
`NEXT_PUBLIC_API_URL` to `https://api.<domain>/api/v1`. The rewrite disappears
when `API_ORIGIN` is unset, the browser talks to the API directly again, and the
cookie is same-site because the two hosts share a registrable domain.

### Two things on Render change once the website has an address

`CORS_ORIGIN` is `https://placeholder.invalid` today, which is doing its job:
until the website has an address, no origin should be allowed. Behind the proxy
the browser makes no cross-origin request at all, so nothing depends on it — but
it should still name the Vercel address rather than a placeholder. `WEB_BASE_URL`
becomes the same value; it is what a password reset link points at, and that one
does matter immediately.
