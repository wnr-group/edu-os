-- Every table in this schema has RLS policies written on the assumption that
-- `authenticated` can reach the table at all (see the many rls_retrofit_*
-- migrations). Postgres checks table-level GRANTs before RLS ever runs, and
-- the base schema migrations (20240001000001_tenancy.sql onward) never
-- granted `authenticated` anything beyond the Postgres/Supabase default of
-- TRIGGER/TRUNCATE/REFERENCES on public tables. Only a handful of later
-- feature migrations (exam_schedule_grants.sql, kyc_documents.sql,
-- leave_requests.sql, admission_tables.sql, etc.) happened to add an
-- explicit `GRANT ... TO authenticated`, so those tables work while the
-- rest — including `schools`, `user_roles`, and `profiles`, which every
-- authenticated page load depends on via SchoolLayout — silently fail with
-- "permission denied" and get swallowed by `data ?? []` call sites,
-- surfacing as an unexplained bounce back to /login.
--
-- This grants exactly the verbs each table's RLS policies already cover
-- (SELECT/INSERT/UPDATE/DELETE) to `authenticated` only — `anon` is left
-- untouched since no policy in this schema accommodates unauthenticated
-- access. RLS remains the actual access-control boundary: a table with only
-- a SELECT policy still rejects writes at the RLS layer regardless of this
-- table-level grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- `service_role` has rolbypassrls = true (it's meant to skip RLS entirely
-- for trusted server-side code — middleware's tenant/role resolution, API
-- routes, the unauthenticated login page's school lookup), but bypassing
-- RLS does not bypass the table-level GRANT check that Postgres performs
-- first. Same gap as `authenticated` above, same fix.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
