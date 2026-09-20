-- Usernames stop being case-sensitive.
--
-- A Grade 6 girl typing her username on a tablet gets a capital first letter
-- whether she asked for one or not. "Sara" not matching "sara" is, to her,
-- indistinguishable from having forgotten her password -- and it is her
-- teacher who then spends the lesson resetting it.
--
-- Two changes, and the order matters:
--
--   1. The unique index, so two names differing only in case cannot exist
--      within one school. This has to come first. Once the lookup below is
--      case-insensitive, a school holding both "Sara" and "sara" would find
--      two rows for either spelling, and the sign-in path reads two rows as
--      "ambiguous" and refuses -- locking out BOTH girls rather than neither.
--
--   2. The lookup itself.
--
-- If step 1 fails, this migration stops and step 2 never runs, which is the
-- safe order: a case-sensitive login that works is better than a
-- case-insensitive one that cannot tell two accounts apart.
--
-- BEFORE APPLYING THIS TO A DATABASE THAT IS IN USE, run the collision check
-- in tooling/deploy (`--check-usernames`). A collision is not fixable from
-- here: which of two real girls keeps the name is a decision for the school,
-- not for a migration. Nothing in this file renames, merges or deletes an
-- account.

-- --- 1. One name per school, whatever the capitals --------------------------
-- A partial index: deleted accounts keep their rows but must not reserve a
-- name, or a girl who leaves takes her username with her for ever.
CREATE UNIQUE INDEX IF NOT EXISTS "users_school_id_lower_username_key"
  ON "users" (school_id, lower(username))
  WHERE deleted_at IS NULL;

-- The platform operator belongs to no school, so school_id is NULL for that
-- row -- and a unique index treats two NULLs as different values, which means
-- the index above would let two operators share a name. That is the same
-- lock-out as any other collision, and worse, because the person locked out is
-- the one who would have to fix it. A second partial index covers exactly that
-- case.
CREATE UNIQUE INDEX IF NOT EXISTS "users_platform_lower_username_key"
  ON "users" (lower(username))
  WHERE school_id IS NULL AND deleted_at IS NULL;

-- --- 2. Signing in ---------------------------------------------------------
-- The original matched `username = p_username` exactly. Everything else about
-- the function is deliberately unchanged: still SECURITY DEFINER, because the
-- school is what signing in establishes and so cannot scope the query; still
-- LIMIT 2, which is how the caller tells "found it" from "that name is
-- ambiguous across schools"; still answering this one question and no other.
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
  WHERE lower(username) = lower(btrim(p_username))
    AND (p_school_id IS NULL OR school_id = p_school_id)
  LIMIT 2;
$$;

-- The grants are attached to the signature, which has not changed, so they
-- survive CREATE OR REPLACE. Restated anyway: a function the application
-- cannot execute is an outage, and this is cheap insurance against a future
-- edit that does change the signature.
REVOKE ALL ON FUNCTION auth_find_users_by_username(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_users_by_username(text, uuid) TO app_user;

-- --- 3. Keeping sign-in fast ----------------------------------------------
-- The unique index above is keyed on (school_id, lower(username)), so it
-- cannot serve the sign-in lookup, which happens before any school is known.
-- Without this, every sign-in is a sequential scan of every user on the
-- platform.
CREATE INDEX IF NOT EXISTS "users_lower_username_idx"
  ON "users" (lower(username));
