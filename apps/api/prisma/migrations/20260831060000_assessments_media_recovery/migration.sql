-- ===========================================================================
-- Phase 6 — assessments, pictures on questions and words, account recovery
--
-- Named to sort after 20260831050000_least_privilege on purpose. Prisma
-- applies migrations in filename order, and three earlier migrations had to
-- be renamed after being generated with a timestamp that sorted before the
-- migration creating a type they depend on.
--
-- Four things arrive together because they share the same tables:
--
--  1. A question now says whether it is practice or the unit's assessment,
--     and an attempt records which it was, the mark that had to be reached
--     and whether it was reached. Assessments reuse activity_attempts rather
--     than getting a table of their own: the engine, the marking and the
--     frozen snapshots are identical, and only the rules around them differ.
--  2. A picture can now hang off a question or a word as well as a grammar
--     section, which means the media policies below had to be rewritten.
--  3. A unit says whether it counts towards the course.
--  4. Password reset tokens, for e-mail recovery.
-- ===========================================================================

-- CreateEnum
CREATE TYPE "question_purpose" AS ENUM ('ACTIVITY', 'ASSESSMENT');

-- AlterTable
ALTER TABLE "activity_attempts" ADD COLUMN     "pass_mark_percent" INTEGER,
ADD COLUMN     "passed" BOOLEAN,
ADD COLUMN     "purpose" "question_purpose" NOT NULL DEFAULT 'ACTIVITY';

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "question_id" UUID,
ADD COLUMN     "vocabulary_item_id" UUID;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "purpose" "question_purpose" NOT NULL DEFAULT 'ACTIVITY';

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "counts_toward_completion" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "media_assets_question_id_idx" ON "media_assets"("question_id");

-- CreateIndex
CREATE INDEX "media_assets_vocabulary_item_id_idx" ON "media_assets"("vocabulary_item_id");

-- CreateIndex
CREATE INDEX "questions_unit_id_purpose_idx" ON "questions"("unit_id", "purpose");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_vocabulary_item_id_fkey" FOREIGN KEY ("vocabulary_item_id") REFERENCES "vocabulary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- A media asset belongs to exactly one thing.
--
-- Three nullable parents in one table is only safe if the database refuses a
-- row that names none of them or more than one. Without this, a row with all
-- three null would be an orphan no policy below can reason about.
-- ---------------------------------------------------------------------------
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_one_parent"
  CHECK (
    (("section_id" IS NOT NULL)::int
     + ("question_id" IS NOT NULL)::int
     + ("vocabulary_item_id" IS NOT NULL)::int) = 1
  );

-- ---------------------------------------------------------------------------
-- Media policies, rewritten for three parents.
--
-- The old read rule was `section_id IS NULL OR EXISTS (... unit_sections ...)`.
-- That IS NULL branch was written when a section was the only parent a row
-- could have, so a section-less row could not exist. It can now, and left as
-- it was the branch would have made every picture attached to a question or a
-- word readable by every school on the platform.
--
-- Reading follows the parent: a picture is visible exactly when the thing it
-- illustrates is, which the parent tables' own policies already decide (that
-- is how the shared master library stays readable). Writing and deleting
-- require the parent's course to belong to the caller's school, matching the
-- rule every other content table carries.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON "media_assets";
CREATE POLICY tenant_isolation ON "media_assets"
  USING (
    EXISTS (SELECT 1 FROM "unit_sections" s WHERE s.id = media_assets.section_id)
    OR EXISTS (SELECT 1 FROM "questions" q WHERE q.id = media_assets.question_id)
    OR EXISTS (SELECT 1 FROM "vocabulary_items" v WHERE v.id = media_assets.vocabulary_item_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "unit_sections" s
        JOIN "units" u ON u.id = s.unit_id
        JOIN "courses" c ON c.id = u.course_id
      WHERE s.id = media_assets.section_id
        AND c.owner_school_id = current_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM "questions" q
        JOIN "units" u ON u.id = q.unit_id
        JOIN "courses" c ON c.id = u.course_id
      WHERE q.id = media_assets.question_id
        AND c.owner_school_id = current_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM "vocabulary_items" v
        JOIN "units" u ON u.id = v.unit_id
        JOIN "courses" c ON c.id = u.course_id
      WHERE v.id = media_assets.vocabulary_item_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- The restrictive delete rule needs the same three parents. Left as it was it
-- required a section, so a picture on a question or a word could never be
-- deleted by anyone — the teacher who uploaded it included.
DROP POLICY IF EXISTS owner_only_delete ON "media_assets";
CREATE POLICY owner_only_delete ON "media_assets"
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "unit_sections" s
        JOIN "units" u ON u.id = s.unit_id
        JOIN "courses" c ON c.id = u.course_id
      WHERE s.id = media_assets.section_id
        AND c.owner_school_id = current_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM "questions" q
        JOIN "units" u ON u.id = q.unit_id
        JOIN "courses" c ON c.id = u.course_id
      WHERE q.id = media_assets.question_id
        AND c.owner_school_id = current_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM "vocabulary_items" v
        JOIN "units" u ON u.id = v.unit_id
        JOIN "courses" c ON c.id = u.course_id
      WHERE v.id = media_assets.vocabulary_item_id
        AND c.owner_school_id = current_school_id()
    )
  );

-- ---------------------------------------------------------------------------
-- password_reset_tokens is deliberately NOT tenant-scoped, for the same
-- reasons as refresh_tokens (see 20260830210000_tenant_isolation_rls, §5).
--
-- A reset begins with an e-mail address and ends with a link; at neither point
-- is a school known, so a tenant policy could only get in the way. The row
-- holds a user id, a hash and two timestamps — no name, no address, nothing
-- personal — and is found only by a hash nobody can guess. The application's
-- own checks govern it: a token is single-use, expires, and only ever resets
-- the password of the user it was issued to.
--
-- The plain token is never stored. Only its hash is, so a copy of this table
-- cannot be used to reset anybody's password.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset_tokens" TO app_user;

-- ---------------------------------------------------------------------------
-- Which units count towards the course.
--
-- The client confirmed on 2026-08-31 that Welcome and Grammar Review are
-- preliminary and revision material: finishing them must not affect the
-- completion of the themed units or of the course.
--
-- This is a one-time correction to existing rows, matched on the two titles
-- the client named. It is not a rule: nothing in the application reads a unit
-- title, and a teacher can flip this flag on any unit from the CMS. Adding a
-- sixth themed unit, or renaming one, needs no change here.
-- ---------------------------------------------------------------------------
UPDATE "units"
   SET counts_toward_completion = false, updated_at = now()
 WHERE title IN ('Welcome', 'Grammar Review');
