-- ---------------------------------------------------------------------------
-- Make the content tables fail closed.
--
-- Shared master content is readable by every school on purpose (SRS 37.2), and
-- the policy expressed that as "is_shared_master OR owner_school_id = ...".
-- That is true even when NO school has been set, so a query that forgot to
-- open a tenant scope saw everything — including the answer keys in
-- `questions`.
--
-- Requiring a school to be set first keeps the sharing behaviour but restores
-- the property the rest of the system relies on: a query with no scope returns
-- nothing rather than everything.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation ON "courses";
CREATE POLICY tenant_isolation ON "courses"
  USING (
    current_school_id() IS NOT NULL
    AND (is_shared_master OR owner_school_id = current_school_id())
  )
  WITH CHECK (owner_school_id = current_school_id());

-- section_types and question_types are reference lists shared by everyone,
-- like a list of countries. They hold no school data and no answers, so they
-- stay readable; but they are read-only to the application either way.
