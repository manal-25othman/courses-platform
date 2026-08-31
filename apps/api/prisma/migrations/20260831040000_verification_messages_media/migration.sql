-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "byte_size" INTEGER,
ADD COLUMN     "data" BYTEA;

-- AlterTable
ALTER TABLE "vocabulary_progress" ADD COLUMN     "check_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_teacher_id_student_id_created_at_idx" ON "messages"("teacher_id", "student_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_student_id_read_at_idx" ON "messages"("student_id", "read_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Messages are personal data about a named child, like her progress, so they
-- are scoped to the school outright with no shared allowance anywhere.
--
-- The school is on the row itself here rather than reached through a join,
-- because a message is written before either party's screens are open and the
-- check should be as direct as possible.
-- ---------------------------------------------------------------------------
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "messages";
CREATE POLICY tenant_isolation ON "messages"
  USING (school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "messages" TO app_user;

-- ---------------------------------------------------------------------------
-- Vocabulary now needs a check answered, not only a card opened.
--
-- Seeing a word and hearing it can both be done by tapping through the cards,
-- which is not learning them (client, 2026-08-30). The rule stays a setting so
-- it can be changed without a deploy; this raises the confirmed value from
-- `seen_and_audio_played` to the stronger reading. SRS 22 is amended by that
-- instruction.
--
-- Words already marked learned under the old rule keep their date. Re-marking
-- them incomplete would take away work a student has genuinely done, and the
-- rule that applied when she did it is the rule she was working to.
-- ---------------------------------------------------------------------------
UPDATE "settings"
   SET value = '"seen_audio_and_checked"', updated_at = now()
 WHERE key = 'vocabulary.completion_rule'
   AND value = '"seen_and_audio_played"';

-- A word already complete counts as checked, so the change is not retroactive.
UPDATE "vocabulary_progress"
   SET verified_at = learned_at
 WHERE learned_at IS NOT NULL AND verified_at IS NULL;
