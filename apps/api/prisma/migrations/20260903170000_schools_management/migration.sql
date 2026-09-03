-- ===========================================================================
-- Onboarding and running a school, from the platform side.
--
-- Five more narrow functions, built the same way as the two the dashboard
-- already uses: SECURITY DEFINER so they can cross the tenant barrier, a
-- pinned search_path, an explicit return shape, taken away from PUBLIC and
-- given to app_user alone. Row-level security is untouched — no policy is
-- changed, FORCE stays on every tenant table, and app_user gains no privilege
-- on any table.
--
-- Why functions at all: app_user cannot insert a school under any scope. The
-- policy on `schools` is WITH CHECK (id = current_school_id()), which a row
-- that does not exist yet can never satisfy. The alternative would have been
-- for the platform operator to adopt a school's identity, which is the one
-- thing the role boundary exists to prevent.
-- ===========================================================================

-- --- 1. Is this school open? ----------------------------------------------
-- Asked by authentication, which runs before any school is established and so
-- has no scope to read `schools` under. One boolean, and nothing else can be
-- learned from it: a school that does not exist answers the same as one that
-- is disabled.
--
-- A null school answers true. The platform operator belongs to none, and
-- disabling a school must never lock out the person who has to fix it.
CREATE OR REPLACE FUNCTION school_is_active(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_school_id IS NULL
     OR EXISTS (SELECT 1 FROM schools WHERE id = p_school_id AND status = 'ACTIVE');
$$;

-- --- 2. Creating a school and its first administrator ---------------------
-- One statement, so there is no such thing as a half-made school. If the
-- administrator cannot be created the school is not created either, and the
-- operator sees a failure rather than an empty tenant nobody can get into.
--
-- The password arrives already hashed. This function never sees, stores or
-- returns a plaintext password, and the caller is responsible for showing the
-- one-time credential to the operator exactly once.
--
-- The administrator is an ADMIN inside the new school and nothing else. She is
-- given a profile only so her name has somewhere to live — the display name is
-- read from there by /auth/me — and nothing assigns her students.
CREATE OR REPLACE FUNCTION platform_create_school(
  p_name text,
  p_admin_username text,
  p_admin_email text,
  p_admin_password_hash text,
  p_admin_display_name text
)
RETURNS TABLE (school_id uuid, admin_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_admin  uuid;
BEGIN
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'A school needs a name.' USING ERRCODE = 'check_violation';
  END IF;

  -- Two schools with the same name would be indistinguishable in every list
  -- the operator reads. Checked in here as well as in the API so that two
  -- requests arriving together cannot both succeed.
  IF EXISTS (SELECT 1 FROM schools WHERE lower(name) = lower(btrim(p_name))) THEN
    RAISE EXCEPTION 'A school with that name already exists.' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO schools (id, name, status, created_at, updated_at)
  VALUES (gen_random_uuid(), btrim(p_name), 'ACTIVE', now(), now())
  RETURNING id INTO v_school;

  INSERT INTO users (
    id, school_id, role, username, email, password_hash,
    must_change_password, status, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_school, 'ADMIN', p_admin_username, p_admin_email,
    p_admin_password_hash,
    -- She replaces the credential the operator handed her at first sign-in,
    -- the same rule a teacher-issued student password follows.
    true, 'ACTIVE', now(), now()
  )
  RETURNING id INTO v_admin;

  INSERT INTO teacher_profiles (user_id, display_name)
  VALUES (v_admin, p_admin_display_name);

  RETURN QUERY SELECT v_school, v_admin;
END
$$;

-- --- 3. One school, counted ----------------------------------------------
-- The same shape `platform_school_overview` returns, for one school, so the
-- detail screen does not have to fetch every school to show one. Nothing
-- personal crosses: no username, no address, no hash, no progress.
CREATE OR REPLACE FUNCTION platform_school_detail(p_school_id uuid)
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
  WHERE s.id = p_school_id
  GROUP BY s.id, s.name, s.status, s.created_at;
$$;

-- --- 4. Renaming a school -------------------------------------------------
-- The only field of a school this platform can change. Everything else about
-- a school is either derived or belongs to the school itself.
CREATE OR REPLACE FUNCTION platform_rename_school(p_school_id uuid, p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed integer;
BEGIN
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'A school needs a name.' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM schools
    WHERE lower(name) = lower(btrim(p_name)) AND id <> p_school_id
  ) THEN
    RAISE EXCEPTION 'A school with that name already exists.' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE schools SET name = btrim(p_name), updated_at = now() WHERE id = p_school_id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  RETURN v_changed = 1;
END
$$;

-- --- 5. Opening and closing a school --------------------------------------
-- What `status` means is now enforced: `school_is_active` above is consulted
-- when anyone signs in and whenever a session is renewed, so a closed school
-- stops letting people in rather than merely being labelled closed.
--
-- Closing one also ends every session inside it, in the same statement. Doing
-- that from the application would have meant reading the school's user rows
-- first, and the platform operator has no scope to read them under —
-- `users` is behind row-level security and would have answered with nothing.
-- Here it is one write against `refresh_tokens`, which carries no school of
-- its own and no policy.
CREATE OR REPLACE FUNCTION platform_set_school_status(p_school_id uuid, p_status "user_status")
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed integer;
BEGIN
  UPDATE schools SET status = p_status, updated_at = now() WHERE id = p_school_id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed = 1 AND p_status = 'DISABLED' THEN
    UPDATE refresh_tokens t
    SET revoked_at = now()
    WHERE t.revoked_at IS NULL
      AND t.user_id IN (SELECT u.id FROM users u WHERE u.school_id = p_school_id);
  END IF;

  RETURN v_changed = 1;
END
$$;

-- --- 6. Who may call them --------------------------------------------------
REVOKE ALL ON FUNCTION school_is_active(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_create_school(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_school_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_rename_school(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_set_school_status(uuid, "user_status") FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT EXECUTE ON FUNCTION school_is_active(uuid) TO app_user;
    GRANT EXECUTE ON FUNCTION platform_create_school(text, text, text, text, text) TO app_user;
    GRANT EXECUTE ON FUNCTION platform_school_detail(uuid) TO app_user;
    GRANT EXECUTE ON FUNCTION platform_rename_school(uuid, text) TO app_user;
    GRANT EXECUTE ON FUNCTION platform_set_school_status(uuid, "user_status") TO app_user;
  END IF;
END
$$;
