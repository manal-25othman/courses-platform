-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_school_id" UUID NOT NULL,
    "is_shared_master" BOOLEAN NOT NULL DEFAULT true,
    "source_course_id" UUID,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT,
    "description" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_types" (
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_vocabulary" BOOLEAN NOT NULL DEFAULT false,
    "is_paper_based" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "section_types_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "unit_sections" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "type_key" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "config" JSONB,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_items" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "word_en" TEXT NOT NULL,
    "meaning_ar" TEXT,
    "part_of_speech" TEXT,
    "example_sentence" TEXT,
    "audio_url" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "section_id" UUID,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "alt_text" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_owner_school_id_idx" ON "courses"("owner_school_id");

-- CreateIndex
CREATE INDEX "units_course_id_idx" ON "units"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_course_id_order_index_key" ON "units"("course_id", "order_index");

-- CreateIndex
CREATE INDEX "unit_sections_unit_id_idx" ON "unit_sections"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_sections_unit_id_order_index_key" ON "unit_sections"("unit_id", "order_index");

-- CreateIndex
CREATE INDEX "vocabulary_items_unit_id_idx" ON "vocabulary_items"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_items_unit_id_word_en_key" ON "vocabulary_items"("unit_id", "word_en");

-- CreateIndex
CREATE INDEX "media_assets_section_id_idx" ON "media_assets"("section_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_sections" ADD CONSTRAINT "unit_sections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_sections" ADD CONSTRAINT "unit_sections_type_key_fkey" FOREIGN KEY ("type_key") REFERENCES "section_types"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "unit_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Tenant isolation for the content tables.
--
-- Content is not owned by whoever reads it. The master library belongs to the
-- client and every school may READ it, but only the owning school may CHANGE
-- it; a school wanting its own version takes a copy (SRS 37.2).
-- ---------------------------------------------------------------------------

ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "courses";
CREATE POLICY tenant_isolation ON "courses"
  -- Readable when it is the shared master, or when it belongs to this school.
  USING (is_shared_master OR owner_school_id = current_school_id())
  -- Writable only by the school that owns it.
  WITH CHECK (owner_school_id = current_school_id());

-- Units, sections, vocabulary and media follow their course. The inner lookup
-- is itself filtered by the policy above, so a row is only reachable when its
-- course is.
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "units";
CREATE POLICY tenant_isolation ON "units"
  USING (EXISTS (SELECT 1 FROM "courses" c WHERE c.id = course_id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "courses" c
    WHERE c.id = course_id AND c.owner_school_id = current_school_id()
  ));

ALTER TABLE "unit_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unit_sections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "unit_sections";
CREATE POLICY tenant_isolation ON "unit_sections"
  USING (EXISTS (SELECT 1 FROM "units" u WHERE u.id = unit_id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "units" u JOIN "courses" c ON c.id = u.course_id
    WHERE u.id = unit_id AND c.owner_school_id = current_school_id()
  ));

ALTER TABLE "vocabulary_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vocabulary_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "vocabulary_items";
CREATE POLICY tenant_isolation ON "vocabulary_items"
  USING (EXISTS (SELECT 1 FROM "units" u WHERE u.id = unit_id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "units" u JOIN "courses" c ON c.id = u.course_id
    WHERE u.id = unit_id AND c.owner_school_id = current_school_id()
  ));

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "media_assets";
CREATE POLICY tenant_isolation ON "media_assets"
  USING (section_id IS NULL OR EXISTS (SELECT 1 FROM "unit_sections" s WHERE s.id = section_id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "unit_sections" s
      JOIN "units" u ON u.id = s.unit_id
      JOIN "courses" c ON c.id = u.course_id
    WHERE s.id = section_id AND c.owner_school_id = current_school_id()
  ));

-- section_types is a shared reference list, like a list of countries. It holds
-- no school data, so every school reads it and only a migration changes it.
ALTER TABLE "section_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "section_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reference_read ON "section_types";
CREATE POLICY reference_read ON "section_types" FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- The section kinds present in the supplied TOP GOAL material.
--
-- Taken from the file itself, which numbers them 1 to 9 within each unit. They
-- are data so a curriculum with different sections needs no code change.
-- ---------------------------------------------------------------------------
INSERT INTO "section_types" (key, display_name, description, is_vocabulary, is_paper_based, is_active, order_index) VALUES
  ('general_question',   'General Question',   'Mixed comprehension and matching questions opening the unit.', false, false, true, 1),
  ('controlled_writing', 'Controlled Writing', 'Guided writing with prompts.',                                   false, false, true, 2),
  ('reading',            'Reading',            'Reading complete sentences.',                                    false, false, true, 3),
  ('grammar',            'Grammar',            'Grammar explanation and exercises.',                             false, false, true, 4),
  ('vocabulary',         'Vocabulary',         'The unit word list, English with Arabic meaning.',               true,  false, true, 5),
  ('orthography',        'Orthography',        'Spelling and letter formation.',                                 false, true,  true, 6),
  ('handwriting',        'Handwriting',        'Handwriting practice. Done on paper, shown here for reference.', false, true,  true, 7),
  ('writing',            'Writing',            'Free writing tasks.',                                            false, false, true, 8),
  ('reading_passage',    'Reading Passage',    'A passage followed by comprehension questions.',                 false, false, true, 9)
ON CONFLICT (key) DO NOTHING;
