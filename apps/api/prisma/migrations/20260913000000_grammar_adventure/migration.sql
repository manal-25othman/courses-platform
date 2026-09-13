-- ---------------------------------------------------------------------------
-- Grammar Adventure.
--
-- No schema change. The registry that lists bonus games already carries a
-- `content_pool` column, added for exactly this: "so a later game can read
-- something else without a change to how games are listed." This game reads
-- the unit's published grammar questions rather than its vocabulary, so it is
-- a row in that registry and nothing more.
--
-- The questions themselves are the ones a teacher already wrote, published,
-- and — where she chose to — tied to a grammar page. There is no second copy
-- of any curriculum content anywhere in this game, and no new table holding
-- anything academic.
-- ---------------------------------------------------------------------------

INSERT INTO "bonus_game_types"
  (key, display_name, description, content_pool, minimum_items, is_active, order_index)
VALUES
  ('grammar_adventure', 'Grammar Adventure',
   'Walk a path through the unit''s world. Every gate, bridge and fork opens with the right grammar.',
   'grammar_questions', 3, true, 3)
ON CONFLICT (key) DO NOTHING;

-- Which stored question kinds may become an obstacle. A setting rather than a
-- rule in code, because a school whose multiple-choice questions are all about
-- grammar should be able to say so without waiting for a release. Absent this
-- row the game falls back to the same list.
INSERT INTO "settings" (id, scope, scope_id, key, value, created_at, updated_at)
SELECT gen_random_uuid(), 'GLOBAL', NULL, 'games.grammar_adventure.types',
       '["complete_sentence","true_false","word_ordering","multiple_choice"]'::jsonb,
       now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "settings" WHERE key = 'games.grammar_adventure.types' AND scope = 'GLOBAL'
);
