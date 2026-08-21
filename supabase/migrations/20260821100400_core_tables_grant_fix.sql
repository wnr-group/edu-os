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
