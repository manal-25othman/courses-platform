-- ---------------------------------------------------------------------------
-- A shared master course must be declared, not defaulted into.
--
-- `is_shared_master` carried a default of true, and no code ever set it. The
-- read policy on `courses` is
--
--     current_school_id() IS NOT NULL
--     AND (is_shared_master OR owner_school_id = current_school_id())
--
-- so every school's own private curriculum was readable by every other
-- tenant: its units, its vocabulary, and — through the questions that hang off
-- those units — its answer keys. The write policies were never wrong, so the
-- content could not be changed from outside; it could simply all be read.
--
-- The barrier is restored by making the flag mean what it says. Sharing is now
-- something a person turns on deliberately.
--
-- Every course that exists today was created by `currentCourse()` for one
-- school and belongs to that school alone; none is a master library. Clearing
-- the flag therefore takes nothing away that was meant to be shared.
-- ---------------------------------------------------------------------------

ALTER TABLE "courses" ALTER COLUMN "is_shared_master" SET DEFAULT false;

UPDATE "courses" SET "is_shared_master" = false WHERE "is_shared_master";
