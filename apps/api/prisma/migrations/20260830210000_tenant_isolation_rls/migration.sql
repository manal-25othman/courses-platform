-- ===========================================================================
-- Database-enforced tenant isolation (SRS 37, 38; ARCHITECTURE 4.1, 12)
--
-- The application already confines every query to the caller's school. This
-- adds a second, independent barrier inside the database, so a missed filter
-- in application code returns NOTHING rather than another school's data.
--
-- Two things make it real, and both are easy to get wrong:
--
--  1. FORCE ROW LEVEL SECURITY. Without FORCE, the table owner ignores every
--     policy. With it, the owner is bound too.
--  2. The application must connect as a NON-SUPERUSER role. A superuser
--     bypasses row level security entirely, no matter what is configured, so
--     connecting as `postgres` would leave this switched on but doing nothing.
-- ===========================================================================

-- --- 1. The restricted role the application connects as ---------------------
-- Created without a password, so it cannot log in until an operator sets one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Future tables and sequences get the same grants automatically, so a later
-- migration cannot accidentally leave the application unable to read a table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- --- 2. How the current school is carried ----------------------------------
-- Set inside each transaction with set_config(..., true), so it applies to
-- that transaction only and cannot leak to the next request on a pooled
-- connection.
--
-- NULLIF matters: after a transaction the setting is left as an empty string
-- rather than being cleared, and ''::uuid raises an error. NULLIF turns it
-- back into NULL, so an unscoped query quietly returns nothing instead of
-- failing with a confusing type error.
CREATE OR REPLACE FUNCTION current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_school_id', true), '')::uuid;
$$;

-- --- 3. Policies ------------------------------------------------------------

-- schools: a school may only see itself.
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schools" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "schools"
  USING (id = current_school_id())
  WITH CHECK (id = current_school_id());

-- users: the roster, and the table that matters most.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());

-- Profiles have no school column of their own; they follow their user. The
-- inner lookup is itself filtered by the policy above, so a profile is only
-- visible when its user is.
ALTER TABLE "teacher_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "teacher_profiles"
  USING (EXISTS (SELECT 1 FROM "users" u WHERE u.id = user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "users" u WHERE u.id = user_id));

ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "student_profiles"
  USING (EXISTS (SELECT 1 FROM "users" u WHERE u.id = user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "users" u WHERE u.id = user_id));

-- audit_log: entries belong to the school they were recorded for.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_log"
  USING (school_id = current_school_id())
  WITH CHECK (school_id IS NOT DISTINCT FROM current_school_id());

-- settings: global defaults (the passing score and so on) are readable by
-- everyone; a value scoped to a school belongs to that school alone.
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "settings"
  USING (scope <> 'SCHOOL' OR scope_id = current_school_id())
  WITH CHECK (scope <> 'SCHOOL' OR scope_id = current_school_id());

-- --- 4. Authentication, which happens before a school is known -------------
-- Signing in means finding a user by username, and renewing a session means
-- finding a token by its hash. Neither knows the school yet, so neither can
-- be tenant-scoped. These functions run as their owner and so see past the
-- policies, but each answers exactly one narrow question and nothing else.
-- They are the only route the application has around the isolation above.

CREATE OR REPLACE FUNCTION auth_find_users_by_username(
  p_username text,
  p_school_id uuid DEFAULT NULL
)
RETURNS SETOF "users"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM "users"
  WHERE username = p_username
    AND (p_school_id IS NULL OR school_id = p_school_id)
  -- Two is enough to tell "found it" from "the name is ambiguous".
  LIMIT 2;
$$;

CREATE OR REPLACE FUNCTION auth_find_user_by_id(p_id uuid)
RETURNS SETOF "users"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM "users" WHERE id = p_id LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_users_by_username(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_user_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_users_by_username(text, uuid) TO app_user;
GRANT EXECUTE ON FUNCTION auth_find_user_by_id(uuid) TO app_user;

-- --- 5. refresh_tokens is deliberately NOT tenant-scoped -------------------
-- It holds a user id, a hash and timestamps: no personal data, and it is
-- looked up by a hash nobody can guess. Renewal and sign-out also happen
-- before a school is known. Tenant policies here would add admin edge cases
-- without protecting anything, so the application's own checks govern it:
-- every token is bound to its user, and a token is only ever accepted for
-- the user it was issued to.
