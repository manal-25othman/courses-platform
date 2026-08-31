-- Takes away privileges the application never uses.
--
-- Three holes found by a health check on 2026-08-31. None of them is reachable
-- through a screen; each is what a stolen application connection could do, and
-- the point of connecting as a restricted role is that the answer to that is
-- "very little".

-- --- 1. The migration ledger -----------------------------------------------
-- app_user could delete every row of `_prisma_migrations` and insert a fake
-- one. Row-level security does not cover it: the ledger belongs to no school,
-- so it has no policy, and the grant was all that stood in the way. The
-- application has never read or written it — Prisma's migrate commands run on
-- the owner connection.
REVOKE ALL ON "_prisma_migrations" FROM app_user;

-- --- 2. Reference data ------------------------------------------------------
-- The question and section registries are read by everyone and changed by
-- nobody at runtime. Their policies already refused writes, so this changes no
-- behaviour; it makes the grant say the same thing the policy does, instead of
-- leaving a permission that only a policy is holding shut.
REVOKE INSERT, UPDATE, DELETE ON "question_types" FROM app_user;
REVOKE INSERT, UPDATE, DELETE ON "section_types" FROM app_user;

-- --- 3. Settings ------------------------------------------------------------
-- The old policy read `scope <> 'SCHOOL' OR scope_id = current_school_id()`
-- for both reading and writing. That is right for reading — resolution has to
-- walk assessment, unit, course, school and then global — but as a write rule
-- it let any school change a GLOBAL value. One school could have moved the
-- passing score, the progress weights or the vocabulary rule for every school
-- on the platform. Confirmed by trying it: 80 became 10.
--
-- Reading stays as it was. Writing is now confined to a school's own
-- overrides, which is what the scoped-settings design is for.
DROP POLICY IF EXISTS tenant_isolation ON "settings";

DROP POLICY IF EXISTS settings_read ON "settings";
CREATE POLICY settings_read ON "settings"
  FOR SELECT
  USING (scope <> 'SCHOOL' OR scope_id = current_school_id());

DROP POLICY IF EXISTS settings_insert ON "settings";
CREATE POLICY settings_insert ON "settings"
  FOR INSERT
  WITH CHECK (scope = 'SCHOOL' AND scope_id = current_school_id());

DROP POLICY IF EXISTS settings_update ON "settings";
CREATE POLICY settings_update ON "settings"
  FOR UPDATE
  USING (scope = 'SCHOOL' AND scope_id = current_school_id())
  WITH CHECK (scope = 'SCHOOL' AND scope_id = current_school_id());

DROP POLICY IF EXISTS settings_delete ON "settings";
CREATE POLICY settings_delete ON "settings"
  FOR DELETE
  USING (scope = 'SCHOOL' AND scope_id = current_school_id());
