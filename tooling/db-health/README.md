# Database health check

Three read-only scripts and one command. Run them against a database before
trusting it — a fresh one after `migrate deploy`, and the live one before a
release. Nothing here writes anything.

```bash
# 1. Migrations apply from nothing, and applying them twice changes nothing.
createdb check && DATABASE_URL=…/check DIRECT_URL=…/check npm run db:deploy -w @courses/api
DATABASE_URL=…/check DIRECT_URL=…/check npm run db:deploy -w @courses/api   # expect: no pending

# 2. The database matches the Prisma schema. Expect "This is an empty migration."
npx prisma migrate diff --from-url "$DIRECT_URL" \
  --to-schema-datamodel apps/api/prisma/schema.prisma --script

# 3. Shape: row-level security, the application role, keys, uniqueness.
psql "$DIRECT_URL" -f tooling/db-health/structure.sql

# 4. Contents: orphans, duplicates, contradictions, and what students can see.
psql "$DIRECT_URL" -f tooling/db-health/integrity.sql

# 5. Frozen attempts: are past results still intact?
psql "$DIRECT_URL" -f tooling/db-health/snapshots.sql

# 6. The tests that prove the rules, against a real PostgreSQL.
npm run test:db -w @courses/api
```

## Reading the results

`structure.sql` prints a verdict per table. Every table except
`_prisma_migrations` and `refresh_tokens` must say `ok`; those two are exempt
for reasons written into the migrations. The application role must show
`is_superuser = f` and `can_bypass_rls = f` — a role with either ignores every
policy, and the API now refuses to start on one.

`integrity.sql` should print **no rows** under every heading in sections 1–3.
Anything it does print is a problem. Section 4 is different: it lists what
students can see right now, and is there to be read rather than to be empty.
Check it before a pilot goes live — nothing test-shaped should appear in it.

`snapshots.sql` counts the frozen copies inside finished attempts. `incomplete`
must be zero. `wording_differs` and `answer_key_differs` being non-zero is the
mechanism working, not a fault: it means a teacher has corrected a question
since a student answered it, and the student's own paper did not change.
