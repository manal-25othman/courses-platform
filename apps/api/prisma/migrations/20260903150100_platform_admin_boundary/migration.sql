-- ===========================================================================
-- What the platform operator is, and the only two things it may read.
--
-- Row-level security is untouched: no policy is changed, FORCE stays on every
-- tenant table, and `app_user` gains no new privilege on any table. The two
-- functions below are the whole of the platform-level read surface, and each
-- answers exactly one question in aggregate.
-- ===========================================================================

-- --- 1. A platform admin belongs to no school ------------------------------
-- The rule that keeps the two worlds apart, held by the database rather than
-- by whichever code path happens to create the row. A platform admin with a
-- school would be a tenant member with platform sight, which is the one
-- combination this design must never allow.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_platform_admin_has_no_school";
ALTER TABLE "users" ADD CONSTRAINT "users_platform_admin_has_no_school" CHECK (
  (role = 'PLATFORM_ADMIN' AND school_id IS NULL)
  OR (role <> 'PLATFORM_ADMIN' AND school_id IS NOT NULL)
);

-- --- 2. Platform totals ----------------------------------------------------
-- Counts, and nothing else. There is no argument, so there is nothing to
-- steer it with, and no column of any row can come back through it.
--
-- Deleted accounts are left out: the platform's size is who is on it, not who
-- ever was. Platform admins are counted separately from school people so the
-- operator is not mistaken for a member of any school.
CREATE OR REPLACE FUNCTION platform_totals()
RETURNS TABLE (
  schools bigint,
  schools_active bigint,
  schools_disabled bigint,
  teachers bigint,
  students bigint,
  school_admins bigint,
  platform_admins bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM schools),
    (SELECT count(*) FROM schools WHERE status = 'ACTIVE'),
    (SELECT count(*) FROM schools WHERE status = 'DISABLED'),
    (SELECT count(*) FROM users WHERE role = 'TEACHER'        AND deleted_at IS NULL),
    (SELECT count(*) FROM users WHERE role = 'STUDENT'        AND deleted_at IS NULL),
    (SELECT count(*) FROM users WHERE role = 'ADMIN'          AND deleted_at IS NULL),
    (SELECT count(*) FROM users WHERE role = 'PLATFORM_ADMIN' AND deleted_at IS NULL);
$$;

-- --- 3. One row per school, counted ---------------------------------------
-- A school's name, its state, when it was created, and how many people are in
-- it by role. The counts are computed here so the caller never has a reason
-- to ask for the people themselves.
--
-- Nothing personal crosses this boundary: no username, no e-mail address, no
-- password hash, no token, no message, no answer, no progress. The return
-- shape is written out in full above the body precisely so that adding such a
-- column later has to be a deliberate act with a reviewer looking at it.
CREATE OR REPLACE FUNCTION platform_school_overview()
RETURNS TABLE (
  id uuid,
  name text,
  status "user_status",
  created_at timestamp(3) without time zone,
  teachers bigint,
  students bigint,
  school_admins bigint,
  courses bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.status,
    s.created_at,
    count(DISTINCT u.id) FILTER (WHERE u.role = 'TEACHER') AS teachers,
    count(DISTINCT u.id) FILTER (WHERE u.role = 'STUDENT') AS students,
    count(DISTINCT u.id) FILTER (WHERE u.role = 'ADMIN')   AS school_admins,
    count(DISTINCT c.id)                                    AS courses
  FROM schools s
  LEFT JOIN users u   ON u.school_id = s.id AND u.deleted_at IS NULL
  LEFT JOIN courses c ON c.owner_school_id = s.id
  GROUP BY s.id, s.name, s.status, s.created_at
  ORDER BY s.created_at ASC;
$$;

-- --- 4. Who may call them --------------------------------------------------
-- Taken away from everybody, then given back to the one role the API
-- connects as. A SECURITY DEFINER function is only as narrow as its grants,
-- so this half matters as much as the bodies above.
REVOKE ALL ON FUNCTION platform_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_school_overview() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT EXECUTE ON FUNCTION platform_totals() TO app_user;
    GRANT EXECUTE ON FUNCTION platform_school_overview() TO app_user;
  END IF;
END
$$;
