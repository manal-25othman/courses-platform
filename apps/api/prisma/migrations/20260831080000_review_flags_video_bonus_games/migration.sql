-- Room for three things the content entry needs.
--
-- 1. A vocabulary word and a grammar section can now say they need a person's
--    eye, the way a question already could. Both are needed by real entries in
--    the supplied material: two words are glossed with digits rather than
--    Arabic, and the grammar scans' pairing to units was read from their
--    content because the document's own headings contradict it.
-- 2. A grammar section can carry an optional video address.
-- 3. Bonus review games get a registry, so which games exist is data rather
--    than a list written into the code.

-- --- 1. Review flags --------------------------------------------------------
ALTER TABLE "vocabulary_items" ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vocabulary_items" ADD COLUMN "review_notes" TEXT;

ALTER TABLE "unit_sections" ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "unit_sections" ADD COLUMN "review_notes" TEXT;

-- --- 2. Optional grammar video ----------------------------------------------
-- Only an address is stored. The player is built from it in the application,
-- so nothing a teacher types is ever rendered as markup, and which hosts are
-- accepted is a setting rather than a rule in code.
ALTER TABLE "unit_sections" ADD COLUMN "video_url" TEXT;

-- --- 3. Bonus game registry -------------------------------------------------
CREATE TABLE "bonus_game_types" (
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "content_pool" TEXT NOT NULL,
    "minimum_items" INTEGER NOT NULL DEFAULT 4,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "bonus_game_types_pkey" PRIMARY KEY ("key")
);

-- Reference data, like the question and section registries: read by everyone,
-- written by nobody at runtime. The policy and the grant are made to say the
-- same thing, rather than leaving a permission that only a policy holds shut.
ALTER TABLE "bonus_game_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bonus_game_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reference_read ON "bonus_game_types";
CREATE POLICY reference_read ON "bonus_game_types" FOR SELECT USING (true);

GRANT SELECT ON "bonus_game_types" TO app_user;
REVOKE INSERT, UPDATE, DELETE ON "bonus_game_types" FROM app_user;

-- The two games the client asked for to start with. Both draw their rounds
-- from vocabulary already stored, so neither adds a duplicate copy of any
-- curriculum content, and neither records anything a student does.
INSERT INTO "bonus_game_types" (key, display_name, description, content_pool, minimum_items, is_active, order_index) VALUES
  ('memory_match', 'Memory Match', 'Turn over cards to find each English word beside its Arabic meaning.', 'vocabulary', 6, true, 1),
  ('quick_match', 'Quick Match', 'Choose the right meaning for a word before the round runs out.', 'vocabulary', 4, true, 2)
ON CONFLICT (key) DO NOTHING;
