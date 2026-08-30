-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "vocabulary_progress" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "seen_at" TIMESTAMP(3),
    "audio_played_at" TIMESTAMP(3),
    "learned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_progress" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_attempts" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "seed" TEXT NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "correct_count" INTEGER,
    "incorrect_count" INTEGER,
    "points_awarded" INTEGER,
    "points_available" INTEGER,
    "score_percent" INTEGER,

    CONSTRAINT "activity_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID,
    "order_index" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "response" JSONB,
    "is_correct" BOOLEAN,
    "points_awarded" INTEGER,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocabulary_progress_student_id_idx" ON "vocabulary_progress"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_progress_student_id_item_id_key" ON "vocabulary_progress"("student_id", "item_id");

-- CreateIndex
CREATE INDEX "section_progress_student_id_idx" ON "section_progress"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "section_progress_student_id_section_id_key" ON "section_progress"("student_id", "section_id");

-- CreateIndex
CREATE INDEX "activity_attempts_student_id_unit_id_idx" ON "activity_attempts"("student_id", "unit_id");

-- CreateIndex
CREATE INDEX "attempt_answers_attempt_id_idx" ON "attempt_answers"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_order_index_key" ON "attempt_answers"("attempt_id", "order_index");

-- AddForeignKey
ALTER TABLE "vocabulary_progress" ADD CONSTRAINT "vocabulary_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_progress" ADD CONSTRAINT "vocabulary_progress_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "vocabulary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "unit_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "activity_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security for a student's own progress.
--
-- Curriculum is shared between schools on purpose. Progress is the opposite:
-- it is personal data about a named child, so these tables are scoped to the
-- school outright, with no shared-master allowance to reach the write paths
-- the way it did for content (see 20260831020000_writes_require_ownership).
--
-- Each row is tied to a school through its student, and `users` is itself
-- strictly scoped, so the subquery returns nothing when no school is set.
-- That alone makes these tables fail closed: a query that forgets to scope
-- sees nothing rather than another school's children. The explicit
-- `current_school_id() IS NOT NULL` below is deliberate belt-and-braces on top
-- of that — verified by mutation: removing it changes nothing, whereas
-- removing the school check from WITH CHECK immediately lets one school write
-- progress against another school's student. The write rule is the load-
-- bearing half; do not weaken it.
-- ---------------------------------------------------------------------------

ALTER TABLE "vocabulary_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vocabulary_progress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "vocabulary_progress";
CREATE POLICY tenant_isolation ON "vocabulary_progress"
  USING (
    current_school_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = vocabulary_progress.student_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = vocabulary_progress.student_id
        AND u.school_id = current_school_id()
    )
  );

ALTER TABLE "section_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "section_progress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "section_progress";
CREATE POLICY tenant_isolation ON "section_progress"
  USING (
    current_school_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = section_progress.student_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = section_progress.student_id
        AND u.school_id = current_school_id()
    )
  );

ALTER TABLE "activity_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity_attempts";
CREATE POLICY tenant_isolation ON "activity_attempts"
  USING (
    current_school_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = activity_attempts.student_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = activity_attempts.student_id
        AND u.school_id = current_school_id()
    )
  );

ALTER TABLE "attempt_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_answers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attempt_answers";
CREATE POLICY tenant_isolation ON "attempt_answers"
  USING (
    current_school_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM activity_attempts a WHERE a.id = attempt_answers.attempt_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM activity_attempts a WHERE a.id = attempt_answers.attempt_id)
  );

-- The restricted role the application connects as.
GRANT SELECT, INSERT, UPDATE, DELETE ON "vocabulary_progress" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "section_progress" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "activity_attempts" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "attempt_answers" TO app_user;

-- ---------------------------------------------------------------------------
-- Which kinds of section count towards which part of progress.
--
-- SRS 16 and 21 define completion and progress over four components. This
-- material has nine kinds of section, and the extra five (Reading, Writing,
-- Controlled Writing, Orthography, Handwriting) sit outside that model — an
-- open decision recorded in docs/CURRICULUM-FINDINGS.md. They are stored as
-- counting towards nothing, so a student can read them but they do not move
-- her progress bar until the client decides otherwise. Changing that decision
-- is an UPDATE here, not a change to the code.
-- ---------------------------------------------------------------------------
ALTER TABLE "section_types" ADD COLUMN "progress_component" TEXT;

UPDATE "section_types" SET "progress_component" = 'grammar'    WHERE key = 'grammar';
UPDATE "section_types" SET "progress_component" = 'vocabulary' WHERE key = 'vocabulary';
