# Removing development data

Three scripts, run once each before real curriculum entry. They select records
by identity — a named unit, a listed username, a specific question id — and
never by a pattern applied to a real unit, so a curriculum record cannot be
caught by accident.

```bash
cd apps/api

# 1. See what would go. Changes nothing.
DRY=1 DIRECT_URL=… node ../../tooling/db-cleanup/remove-test-data.mjs

# 2. Remove it.
DIRECT_URL=… node ../../tooling/db-cleanup/remove-test-data.mjs

# 3. Put every unit and every imported question back to DRAFT.
#    (The rights hold this was written for was lifted on 2026-09-02; it is
#     kept as an unpublish that can only ever hide content, never expose it.)
DIRECT_URL=… node ../../tooling/db-cleanup/restore-rights-hold.mjs

# 4. Retire a development password that has appeared in a transcript.
DIRECT_URL=… node ../../tooling/db-cleanup/retire-teacher-credential.mjs
```

## What each one does

**`remove-test-data.mjs`** classifies every question inside a real unit as
confirmed curriculum, confirmed test, or uncertain, and deletes only the
middle group. Two independent marks have to agree before a question is called
test data: it carries no `source_ref` back into the source document, **and**
its wording matches one of the fixtures these suites write. Anything that
satisfies one but not the other is reported and left alone. Whole test units,
test accounts and empty test schools go as units; a school is only removed
after its users are, and only if it is then genuinely empty.

**`restore-rights-hold.mjs`** returns every unit and every imported question to
DRAFT. Confirmed decision §51: nothing from the supplied source file reaches a
student until the client confirms she holds the right to use and distribute it.
Publishing a unit to run a browser suite breaks that hold, so this puts it
back. It only ever demotes — it never publishes anything.

**`retire-teacher-credential.mjs`** replaces the development teacher's password
with a random value that nothing records — not the script, not the log, not any
report — and sets `mustChangePassword`. Use it whenever a development password
has ended up somewhere it should not be. Getting back in is the platform's own
recovery flow: with no `RESEND_API_KEY` set, the API writes the reset link to
its own log.

## What is never touched

Migrations, the settings store, the question and section registries, row-level
security policies, and the audit log. The audit log has no foreign keys, so
removing a user leaves the record of what that user did intact — which is the
point of keeping it.
