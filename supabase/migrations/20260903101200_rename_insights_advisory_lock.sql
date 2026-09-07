-- supabase/migrations/20260903101200_rename_insights_advisory_lock.sql
--
-- Fixes a Postgres 42725 (ambiguous_function) that broke every Supabase
-- Storage upload in the app, KYC included.
--
-- 20260824144842_insights_recompute_dispatch.sql (already on main, part of
-- the Insights feature, brought into this branch by the recent merge from
-- main) defined public.pg_advisory_xact_lock(uuid) — a name that exactly
-- shadows the Postgres builtin pg_catalog.pg_advisory_xact_lock(bigint).
-- Supabase Storage's own internal upload-locking query calls
-- pg_advisory_xact_lock($1) with an untyped bigint parameter; with the
-- custom uuid overload also in the search path, Postgres can no longer
-- pick a unique candidate for that untyped call and raises
-- "42725: Could not choose a best candidate function." This affects every
-- bucket, not just kyc-docs — reproduced with a plain curl upload to
-- confirm it's unrelated to any KYC-specific code.
--
-- Cannot edit 20260824144842 directly — it's already on main. Repo-wide
-- grep for pg_advisory_xact_lock (migrations, apps/, packages/, supabase/
-- functions/) turns up no real caller of the uuid overload anywhere —
-- only its own definition and the REVOKE statement in
-- 20260824154000_revoke_insights_intervention_rpcs.sql (also main). So
-- this is a pure rename: drop the colliding name, recreate the identical
-- function under a name that can never collide with a Postgres builtin,
-- and lock it down with the same ACL the old name already had. No caller
-- needs updating.
DROP FUNCTION IF EXISTS public.pg_advisory_xact_lock(uuid);

CREATE FUNCTION public.acquire_school_insights_lock(
  p_school_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Acquire advisory lock using hashtext on school_id
  -- Lock is automatically released at transaction end
  PERFORM pg_advisory_xact_lock(hashtext(p_school_id::text));
END;
$$;

COMMENT ON FUNCTION public.acquire_school_insights_lock IS
  'Acquires a transaction-scoped advisory lock for a school_id to prevent concurrent processing';

-- Matches the ACL the old name already had (20260824154000 revoked it
-- from PUBLIC, anon, authenticated, leaving only the owner able to call
-- it) — CREATE FUNCTION grants PUBLIC EXECUTE by default, so that has to
-- be stripped again here to reproduce the same locked-down state.
REVOKE ALL ON FUNCTION public.acquire_school_insights_lock(uuid) FROM PUBLIC, anon, authenticated;
