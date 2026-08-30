-- Shared content may be READ by every school, but only its owner may change it.
--
-- The content tables carry one policy written as FOR ALL, whose USING clause
-- deliberately lets a school read the shared master library. PostgreSQL applies
-- USING (not WITH CHECK) to DELETE, so that same allowance made another
-- school's content deletable. question_set_items had a second version of the
-- same problem: its WITH CHECK only required the parent set to be *visible*,
-- and a shared set is visible to everybody.
--
-- These policies are RESTRICTIVE, so they are ANDed with the existing ones:
-- nothing that was refused becomes allowed, and every write path now has to
-- prove ownership. Reading is untouched.

-- --- courses ---------------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "courses";
CREATE POLICY owner_only_delete ON "courses"
  AS RESTRICTIVE FOR DELETE
  USING (owner_school_id = current_school_id());

-- --- units -----------------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "units";
CREATE POLICY owner_only_delete ON "units"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = units.course_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- --- unit_sections ---------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "unit_sections";
CREATE POLICY owner_only_delete ON "unit_sections"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM units u JOIN courses c ON c.id = u.course_id
      WHERE u.id = unit_sections.unit_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- --- vocabulary_items ------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "vocabulary_items";
CREATE POLICY owner_only_delete ON "vocabulary_items"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM units u JOIN courses c ON c.id = u.course_id
      WHERE u.id = vocabulary_items.unit_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- --- media_assets ----------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "media_assets";
CREATE POLICY owner_only_delete ON "media_assets"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM unit_sections s
        JOIN units u ON u.id = s.unit_id
        JOIN courses c ON c.id = u.course_id
      WHERE s.id = media_assets.section_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- --- questions -------------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "questions";
CREATE POLICY owner_only_delete ON "questions"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM units u JOIN courses c ON c.id = u.course_id
      WHERE u.id = questions.unit_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- --- question_sets ---------------------------------------------------------
DROP POLICY IF EXISTS owner_only_delete ON "question_sets";
CREATE POLICY owner_only_delete ON "question_sets"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM units u JOIN courses c ON c.id = u.course_id
      WHERE u.id = question_sets.unit_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- --- question_set_items ----------------------------------------------------
-- Both halves here: the missing DELETE restriction, and the write check that
-- only asked whether the parent set could be seen.
DROP POLICY IF EXISTS owner_only_delete ON "question_set_items";
CREATE POLICY owner_only_delete ON "question_set_items"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM question_sets s
        JOIN units u ON u.id = s.unit_id
        JOIN courses c ON c.id = u.course_id
      WHERE s.id = question_set_items.set_id
        AND c.owner_school_id = current_school_id()
    )
  );

DROP POLICY IF EXISTS owner_only_write ON "question_set_items";
CREATE POLICY owner_only_write ON "question_set_items"
  AS RESTRICTIVE FOR ALL
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM question_sets s
        JOIN units u ON u.id = s.unit_id
        JOIN courses c ON c.id = u.course_id
      WHERE s.id = question_set_items.set_id
        AND c.owner_school_id = current_school_id()
    )
  );
