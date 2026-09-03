-- ---------------------------------------------------------------------------
-- A role for the platform operator.
--
-- Not a flavour of ADMIN. Every teacher-facing endpoint declares
-- `@Roles(TEACHER, ADMIN)` and then resolves the caller's school, so teaching
-- ADMIN to mean "platform" as well would have handed a platform operator
-- teacher powers inside whichever school happened to resolve. A separate
-- value leaves every one of those declarations meaning what it already meant.
--
-- Alone in its own migration because PostgreSQL will not let a new enum value
-- be used in the transaction that adds it, and the next migration uses it.
-- ---------------------------------------------------------------------------

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
