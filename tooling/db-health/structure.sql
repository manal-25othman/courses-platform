-- Structural health of the database.
--
-- Everything here is read-only and answers one question per block: is the
-- shape of the database what the platform's rules require? Run it against a
-- freshly migrated database, and against a real one before a deployment.

\pset pager off
\echo '=============================================================='
\echo ' A. TABLES AND ROW-LEVEL SECURITY'
\echo '=============================================================='

-- Every table except the migration ledger and refresh_tokens must have RLS
-- enabled AND forced. FORCE is what binds the table owner too; without it the
-- protection looks configured and does nothing.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       CASE
         WHEN c.relname IN ('_prisma_migrations', 'refresh_tokens') THEN 'exempt (documented)'
         WHEN c.relrowsecurity AND c.relforcerowsecurity
              AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) > 0 THEN 'ok'
         ELSE '*** UNPROTECTED ***'
       END AS verdict
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY (CASE WHEN c.relname IN ('_prisma_migrations','refresh_tokens') THEN 1 ELSE 0 END), c.relname;

\echo ''
\echo '--- any table that should be protected and is not (expect 0 rows) ---'
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname NOT IN ('_prisma_migrations', 'refresh_tokens')
  AND NOT (c.relrowsecurity AND c.relforcerowsecurity
           AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));

\echo ''
\echo '=============================================================='
\echo ' B. THE APPLICATION ROLE'
\echo '=============================================================='
-- The application must not connect as anything that ignores the policies.
SELECT rolname,
       rolsuper AS is_superuser,
       rolbypassrls AS can_bypass_rls,
       rolcreaterole AS can_create_roles,
       rolcanlogin AS can_log_in,
       CASE WHEN rolsuper OR rolbypassrls THEN '*** WOULD IGNORE RLS ***' ELSE 'ok' END AS verdict
FROM pg_roles
WHERE rolname = 'app_user';

\echo ''
\echo '--- what app_user may do to each table ---'
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS granted
FROM information_schema.role_table_grants
WHERE grantee = 'app_user' AND table_schema = 'public'
GROUP BY table_name ORDER BY table_name;

\echo ''
\echo '=============================================================='
\echo ' C. FOREIGN KEYS'
\echo '=============================================================='
SELECT conrelid::regclass AS child,
       confrelid::regclass AS parent,
       CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE'
                        WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT'
                        WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
       convalidated AS validated
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

\echo ''
\echo '--- any foreign key not validated by the database (expect 0 rows) ---'
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND NOT convalidated;

\echo ''
\echo '=============================================================='
\echo ' D. UNIQUENESS'
\echo '=============================================================='
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef LIKE 'CREATE UNIQUE%' AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;
