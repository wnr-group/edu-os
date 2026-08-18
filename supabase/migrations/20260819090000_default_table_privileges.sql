-- Baseline CRUD grants for authenticated/service_role on every existing
-- table and sequence, plus default privileges so future ones inherit the
-- same grants automatically. Every table in this schema has RLS enabled
-- (verified: 51/51), so RLS remains the actual row-level authorization
-- boundary — a grant only lets Postgres's own privilege check pass so RLS
-- can then evaluate; it exposes nothing beyond what each table's policies
-- already allow. TRUNCATE/REFERENCES/TRIGGER/MAINTAIN are deliberately
-- excluded, since RLS cannot constrain them. Functions are untouched —
-- those keep the existing per-function GRANT EXECUTE convention.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
