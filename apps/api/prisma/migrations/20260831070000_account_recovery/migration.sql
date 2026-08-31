-- ===========================================================================
-- Account recovery: the two lookups that happen before a school is known.
--
-- Named to sort after 20260831060000_assessments_media_recovery. Prisma
-- applies migrations in filename order.
--
-- Recovering an account starts with an e-mail address and continues with a
-- link. At neither point has anyone signed in, so no school is set and every
-- tenant policy would refuse the read. This is the same situation signing in
-- is in, and it is answered the same way: two functions that run as their
-- owner and each answer exactly one narrow question.
--
-- These are the only additions to the small list of routes around the
-- policies. Both are deliberately incapable of being used for anything else:
-- one takes an address and returns matching accounts, the other takes the
-- hash of a token and returns the one row it belongs to.
-- ===========================================================================

-- --- 1. Finding an account by its e-mail address ---------------------------
-- A disabled or deleted account is not returned. Recovery must not be a way
-- to establish that a removed account ever existed, and a reset on one would
-- be pointless anyway.
--
-- More than one account can share an address across schools, exactly as
-- usernames can. Every match is returned and the caller decides; the reset
-- route sends one link per matching account, so nobody is locked out because
-- a colleague at another school uses the same address.
CREATE OR REPLACE FUNCTION auth_find_users_by_email(p_email text)
RETURNS SETOF "users"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM "users"
  WHERE lower(email) = lower(p_email)
    AND deleted_at IS NULL
    AND status = 'ACTIVE'
  -- A generous cap. Nobody has a legitimate reason to be past this, and it
  -- stops one address from causing an unbounded number of e-mails.
  LIMIT 10;
$$;

-- --- 2. Redeeming a reset token --------------------------------------------
-- Found by the hash of the token, which is the only thing stored. A token
-- that has expired or already been used returns nothing, so those cases are
-- decided here rather than by the caller remembering to check.
CREATE OR REPLACE FUNCTION auth_find_reset_token(p_token_hash text)
RETURNS TABLE (id uuid, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id
  FROM "password_reset_tokens" t
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_users_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_reset_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_users_by_email(text) TO app_user;
GRANT EXECUTE ON FUNCTION auth_find_reset_token(text) TO app_user;
