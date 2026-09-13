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
--
-- One row, and deliberately only one row.
--
-- An earlier draft of this migration also seeded a GLOBAL row in `settings`
-- naming the question kinds the game may use. It ran locally and would have
-- failed in production, which is worth recording so nobody adds it back:
-- `settings` is under FORCE ROW LEVEL SECURITY, and `settings_insert` admits
-- only `scope = 'SCHOOL'`. FORCE applies the policy to the table's owner too,
-- so a managed-Postgres migration role — an owner, but not a superuser — is
-- refused. Proved by running that exact INSERT as a non-superuser owner:
--
--   ERROR: new row violates row-level security policy for table "settings"
--
-- The whole migration would have rolled back and this registry row with it.
-- The setting is not needed anyway: with no row, the game falls back to the
-- same list in code (DEFAULT_ELIGIBLE_TYPES), and a school that wants to widen
-- it writes a SCHOOL-scoped row through the app, which the policy does allow.
-- ---------------------------------------------------------------------------

INSERT INTO "bonus_game_types"
  (key, display_name, description, content_pool, minimum_items, is_active, order_index)
VALUES
  ('grammar_adventure', 'Grammar Adventure',
   'Help Lina reach the destination. Every gate, bridge and fork on the way opens with the right grammar.',
   'grammar_questions', 3, true, 3)
ON CONFLICT (key) DO NOTHING;
