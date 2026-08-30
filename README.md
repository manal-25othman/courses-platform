# TOP GOAL — Interactive English Learning Platform

An educational web platform for Grade 6 English, built around the TOP GOAL curriculum.

> **Current status: Phase 0 — foundation only.**
> No features are built yet. The applications start, connect to the database and
> serve a health check. Everything else is Phase 1 onward.

## Documentation

| Document | What it is |
|---|---|
| [`docs/SRS.md`](docs/SRS.md) | The requirements. **The source of truth** — sections 1–60 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The technical design, and the log of every approved decision |

If a question about *what the system should do* comes up, `docs/SRS.md` answers it.
If it is about *how it is built*, `docs/ARCHITECTURE.md` answers it.

## What's in here

```text
courses-platform/
├── apps/
│   ├── api/    The engine (NestJS). All rules and security live here
│   └── web/    The website (Next.js). Talks to the API, holds no rules of its own
├── packages/
│   └── shared-types/   Types shared by the API and its clients
└── docs/       Requirements and architecture
```

The API is kept separate from the website on purpose: a future mobile app uses
the exact same API without anything being rewritten (SRS §43).

## Running it locally

You need [Node.js](https://nodejs.org) version 20 or newer.

**1. Install everything**

```bash
npm install
```

**2. Create your settings file**

```bash
cp .env.example .env
```

Then open `.env` and fill in your Supabase database connection strings.
Supabase gives you two — you need both. In Supabase go to
**Project Settings → Database → Connection string**:

- `DATABASE_URL` — the **pooled** connection (port 6543), used by the running app
- `DIRECT_URL` — the **direct** connection (port 5432), used for database changes

**3. Set up the database**

```bash
npm run db:migrate    # creates the tables
npm run db:seed       # loads the confirmed settings (passing score, etc.)
```

**4. Start it**

Open two terminals:

```bash
npm run dev:api    # the engine, on http://localhost:3001
npm run dev:web    # the website, on http://localhost:3000
```

Check it works by visiting <http://localhost:3001/api/v1/health>.
You should see `"status": "ok"` and `"database": "connected"`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev:api` | Start the API with auto-reload |
| `npm run dev:web` | Start the website with auto-reload |
| `npm run typecheck` | Check for type errors everywhere |
| `npm run build` | Build everything for production |
| `npm run db:migrate` | Apply database changes |
| `npm run db:seed` | Load the confirmed configuration values |
| `npm run db:studio` | Browse the database in your browser |

## Why there are no hard-coded rules

Values the client may want to change — the 80% passing score, the 2-attempt
limit, progress weights, whether games count toward completion — are **stored in
the database**, not written into the code. They are loaded by `npm run db:seed`
and read through the settings service.

Changing the passing score is an update to one row. It is never a code change.

## Security

Never commit `.env`. It holds your database password.
`.gitignore` already excludes it — keep it that way.
