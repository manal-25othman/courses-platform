# Handing the platform over

Everything here runs on four accounts that somebody has to own and pay for:
the database (Supabase), the API (Render), the website (Vercel) and the domain.
While a platform is being built it is convenient for all four to belong to the
person building it. Once it is running in a school, that arrangement is a
liability: the school cannot renew a card, cannot answer an outage, and cannot
carry on if the developer stops answering.

This is the order in which they move, and what breaks if the order is wrong.

## What the school ends up owning

| Service | What it holds | Cost if it lapses |
| --- | --- | --- |
| Domain registrar | The address itself | The site becomes unreachable at the name everyone was given |
| Vercel | The website | The site stops. The code is safe |
| Render | The API | Every screen stops. The data is safe |
| Supabase | **The data** | The school's own work. This is the one that cannot be rebuilt |
| Resend | Password-reset e-mail | Nobody locked out can get back in unaided |

Supabase is the one that matters and, on this project, was created in the
school's own name from the start. The rest follow.

## The source code is separate, and stays separate

The repository is not on this list. Deployment reads the repository; it does not
contain it. A hosting account can be handed over while the repository stays
where it is, and the school's Vercel is given permission to read that one
repository and nothing else — which is what the Vercel GitHub App grants.

Moving the repository itself is one action (`Settings` → `Transfer ownership`)
and can happen whenever the commercial side is settled. Nothing technical
depends on doing it early, and one thing depends on not doing it early: whoever
owns the repository is the only person who can ship a fix.

## The order

### 1. The domain, bought in the school's name

Register it on an account whose e-mail belongs to the school, not to the
developer. This is the step that is genuinely painful to undo: after a
registration, ICANN blocks a transfer to a *different* registrar for 60 days.
Moving a domain between two accounts at the *same* registrar is usually quick,
so the cost of getting this wrong is smaller than it looks — but it is still a
step that need not exist.

Buy it and stop. Do not point it anywhere yet. The site it should point at is
about to move.

### 2. The website, moved to the school's Vercel

The school creates its own Vercel account and imports the project. It will ask
for access to the repository; the repository's owner approves it, scoped to this
one repository.

Two environment variables come with it, and the deployment is wrong without
them:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api/v1` — a path, not an address |
| `API_ORIGIN` | the Render address, no trailing slash, no `/api/v1` |

`API_ORIGIN` is read when the site is *built*, so changing it means redeploying,
not just saving.

### 3. `CORS_ORIGIN`, in the same sitting

A project moved to a new Vercel account gets a new `*.vercel.app` address. The
API refuses browsers it has not been told to expect, so until Render is told the
new address, the new site cannot talk to the API at all.

`CORS_ORIGIN` accepts a comma-separated list precisely so this does not have to
be a cut-over:

```
CORS_ORIGIN=https://new-name.vercel.app, https://old-name.vercel.app
```

Both work; the old address keeps serving until DNS and habits have caught up,
and the old entry is removed later.

**Write the address the site should be reached at first.** `WEB_BASE_URL`
falls back to `CORS_ORIGIN` when it is not set, and that is what a password
reset link is built from — so the first entry is the one that lands in
somebody's inbox. Better still, set `WEB_BASE_URL` explicitly and the question
does not arise.

### 4. The domain, attached

Point the domain at Vercel and `api.<domain>` at Render. Then, and only then:

- remove `API_ORIGIN` from Vercel
- set `NEXT_PUBLIC_API_URL` to `https://api.<domain>/api/v1`
- set `CORS_ORIGIN` **and** `WEB_BASE_URL` to `https://<domain>`
- redeploy the website, because `NEXT_PUBLIC_API_URL` is baked in at build time

The same-origin proxy exists only because `*.vercel.app` and `*.onrender.com`
are different registrable domains, which makes the session cookie cross-site.
Once both live under one domain that reason is gone, and dropping `API_ORIGIN`
turns the proxy off by itself. Nothing has to be undone.

### 5. Render and Supabase billing

Transfer the Render service to the school's account, or recreate it there from
the same repository and the same environment variables. Move Supabase billing
to the school's payment method — the project is already in its name.

Render's free tier sleeps after inactivity, so the first person to open the site
each morning waits roughly a minute. A school timetable is exactly the pattern
that triggers this. It is a paid-tier fix, not a code fix.

### 6. Resend, last

Password recovery is the only feature that needs e-mail, and it degrades
honestly without it: with no `RESEND_API_KEY` the API writes the reset link to
its own log instead of sending it, so a teacher can still be let back in by
someone with access to the logs. That makes this the safest step to leave until
the domain is settled, which suits it, because verifying a sending domain needs
the domain anyway.

Set `RESEND_API_KEY` and `EMAIL_FROM` on Render once the domain is verified.

## After each step, check one thing

Not a full test pass — one fact that is only true if the step worked.

| Step | Check |
| --- | --- |
| Domain bought | It appears in the registrar account, registered to the school |
| Vercel moved | The new address loads the sign-in screen |
| `CORS_ORIGIN` set | A teacher can actually sign in on the new address |
| Domain attached | The site loads at the domain and a student can open a unit |
| Render moved | `/health` answers `{"status":"ok","database":"connected"}` |
| Resend set | A password reset arrives as an e-mail, and its link opens the site |

The sign-in check after step 3 is the one people skip. It is also the only one
that proves the website and the API are still speaking to each other, which is
the thing the move most easily breaks.
