-- Baseline CRUD grants for authenticated/service_role on every existing
-- table and sequence, plus default privileges so future ones inherit the
-- same grants automatically. Every table in this schema has RLS enabled
-- (verified: 51/51), so for `authenticated` RLS remains the actual
-- row-level authorization boundary — a grant only lets Postgres's own
-- privilege check pass so RLS can then evaluate; it exposes nothing beyond
-- what each table's policies already allow. `service_role` bypasses RLS
-- entirely by design (it's already fully trusted, server-side-only), so
-- this grant matches its existing trust level rather than being gated by
-- policy — RLS is not what makes this grant safe for that role.
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN are deliberately excluded, since RLS
-- cannot constrain them. Functions are untouched — those keep the existing
-- per-function GRANT EXECUTE convention.
--
-- The one-time backfill below targets ordinary tables only (relkind = 'r'),
-- explicitly excluding views/materialized views/foreign tables — GRANT ...
-- ON ALL TABLES IN SCHEMA would otherwise also cover the two existing views
-- (student_fee_status, student_kyc_completeness). Both already use
-- security_invoker and were already SELECT-only for authenticated; this
-- backfill isn't the place to widen that.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', r.relname);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Kept as-is: required so future tables get grants automatically, without
-- per-migration boilerplate — the actual problem this migration exists to
-- fix. Postgres's default-privilege mechanism has no "tables but not views"
-- distinction, so this will also cover any future view; that residual risk
-- is accepted and tracked via Supabase's built-in Security Advisor (flags
-- "Security Definer View" / "RLS Disabled in Public") rather than solved in
-- SQL here — see the PR #20 review discussion.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
