-- Migration: 20260902000000_grant_service_role_worker_rpcs.sql
--
-- Finding #1: Restore service_role EXECUTE on worker RPCs.
-- Finding #5: Grant EXECUTE on notify_parent_for_intervention to authenticated.
--
-- Background: 20260824154000 revoked worker RPCs from PUBLIC/anon/authenticated
-- but never explicitly granted them to service_role.  Supabase service_role is
-- NOSUPERUSER and does NOT automatically bypass function ACLs, so the nightly
-- Edge Function (which runs with the service-role key) would fail to call these
-- functions after migration 20260824154000 was applied.
--
-- notify_parent_for_intervention was also revoked from PUBLIC/anon/authenticated
-- in that migration (correct — it should be called by authenticated users who
-- pass internal authorization), but the GRANT to authenticated was accidentally
-- omitted.  This migration corrects that forward.
--
-- insights_recompute_dispatch is invoked by pg_cron which runs as the
-- database owner (postgres role), so no service_role grant is needed for it.
-- The other four worker RPCs are called by the Edge Function via the
-- service-role client.

-- ===========================================================================
-- Grant EXECUTE on worker RPCs to service_role
-- ===========================================================================

GRANT EXECUTE ON FUNCTION public.claim_insight_run_chunk(uuid, date, int, int, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_insight_run(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_insight_run_counter(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_intervention_if_qualifying(uuid) TO service_role;

-- ===========================================================================
-- Grant EXECUTE on notify_parent_for_intervention to authenticated
-- (corrects omission in 20260824154000 — this is the teacher-callable RPC)
-- ===========================================================================

GRANT EXECUTE ON FUNCTION public.notify_parent_for_intervention(uuid, uuid) TO authenticated;
