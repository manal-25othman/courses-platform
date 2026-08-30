-- CreateEnum
CREATE TYPE "question_set_purpose" AS ENUM ('ACTIVITY', 'ASSESSMENT', 'PRACTICE');

-- CreateEnum
CREATE TYPE "selection_mode" AS ENUM ('ALL', 'RANDOM_N');

-- CreateTable
CREATE TABLE "question_types" (
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "supports_option_shuffle" BOOLEAN NOT NULL DEFAULT true,
    "is_typed" BOOLEAN NOT NULL DEFAULT false,
    "needs_media" BOOLEAN NOT NULL DEFAULT false,
    "present_in_source" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "question_types_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "section_id" UUID,
    "type_key" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "answer_key" JSONB NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_notes" TEXT,
    "source_ref" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_sets" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "purpose" "question_set_purpose" NOT NULL DEFAULT 'ACTIVITY',
    "title" TEXT NOT NULL,
    "selection_mode" "selection_mode" NOT NULL DEFAULT 'ALL',
    "question_count" INTEGER,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_set_items" (
    "id" UUID NOT NULL,
    "set_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "question_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_unit_id_idx" ON "questions"("unit_id");

-- CreateIndex
CREATE INDEX "questions_section_id_idx" ON "questions"("section_id");

-- CreateIndex
CREATE INDEX "questions_type_key_idx" ON "questions"("type_key");

-- CreateIndex
CREATE INDEX "questions_needs_review_idx" ON "questions"("needs_review");

-- CreateIndex
CREATE INDEX "question_sets_unit_id_idx" ON "question_sets"("unit_id");

-- CreateIndex
CREATE INDEX "question_set_items_set_id_idx" ON "question_set_items"("set_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_set_items_set_id_question_id_key" ON "question_set_items"("set_id", "question_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "unit_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_type_key_fkey" FOREIGN KEY ("type_key") REFERENCES "question_types"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "question_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Tenant isolation for the question tables, following their unit and course.
-- ---------------------------------------------------------------------------
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "questions";
CREATE POLICY tenant_isolation ON "questions"
  USING (EXISTS (SELECT 1 FROM "units" u WHERE u.id = unit_id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "units" u JOIN "courses" c ON c.id = u.course_id
    WHERE u.id = unit_id AND c.owner_school_id = current_school_id()
  ));

ALTER TABLE "question_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_sets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "question_sets";
CREATE POLICY tenant_isolation ON "question_sets"
  USING (EXISTS (SELECT 1 FROM "units" u WHERE u.id = unit_id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "units" u JOIN "courses" c ON c.id = u.course_id
    WHERE u.id = unit_id AND c.owner_school_id = current_school_id()
  ));

ALTER TABLE "question_set_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_set_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "question_set_items";
CREATE POLICY tenant_isolation ON "question_set_items"
  USING (EXISTS (SELECT 1 FROM "question_sets" s WHERE s.id = set_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "question_sets" s WHERE s.id = set_id));

-- question_types is a shared reference list, like section_types.
ALTER TABLE "question_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reference_read ON "question_types";
CREATE POLICY reference_read ON "question_types" FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- The question kinds. Those found in the supplied TOP GOAL material, plus the
-- ones SRS 10 names. present_in_source records which is which, so nothing is
-- invented to fill a kind the curriculum does not use.
-- ---------------------------------------------------------------------------
INSERT INTO "question_types"
  (key, display_name, description, supports_option_shuffle, is_typed, needs_media, present_in_source, is_active, order_index) VALUES
  ('multiple_choice',  'Multiple Choice',  'Choose the correct answer from options.',            true,  false, false, true,  true, 1),
  ('true_false',       'True / False',     'Mark a sentence true or false.',                     false, false, false, true,  true, 2),
  ('matching',         'Matching',         'Match each item on the left to one on the right.',   true,  false, false, true,  true, 3),
  ('word_ordering',    'Word Ordering',    'Put the words in order to make a sentence.',         true,  false, false, true,  true, 4),
  ('missing_letter',   'Missing Letter',   'Choose the letter that completes the word.',         true,  false, false, true,  true, 5),
  ('odd_one_out',      'Odd One Out',      'Pick the word that does not belong with the others.', true, false, false, true,  true, 6),
  ('complete_sentence','Complete the Sentence', 'Choose the word that completes the sentence.',  true,  false, false, true,  true, 7),
  ('picture_matching', 'Picture Matching', 'Match a picture with the correct word.',             true,  false, true,  true,  true, 8),
  ('picture_word',     'Word for a Picture', 'Write the word for the picture shown.',            false, true,  true,  true,  true, 9),
  ('spelling',         'Spelling',         'Write the correct spelling.',                        false, true,  false, true,  true, 10),
  ('short_answer',     'Short Answer',     'Answer in a few words.',                             false, true,  false, true,  true, 11),
  -- Named in SRS 10 but absent from the supplied material. Registered so the
  -- platform supports it; no question of this kind was imported.
  ('grammar_transformation', 'Grammar Transformation', 'Rewrite a sentence in a different form.', false, true, false, false, true, 12)
ON CONFLICT (key) DO NOTHING;
