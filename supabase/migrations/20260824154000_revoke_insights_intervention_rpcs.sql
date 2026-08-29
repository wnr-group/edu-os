-- Migration: 20260824154000_revoke_insights_intervention_rpcs.sql
--
-- Fix BLOCKER 3: Revoke PUBLIC/anon EXECUTE on insights & intervention RPCs
--
-- Service-role-only functions (called by backend/cron/Edge Functions):
--   - insights_recompute_dispatch
--   - claim_insight_run_chunk
--   - heartbeat_insight_run
--   - increment_insight_run_counter
--   - create_intervention_if_qualifying
--
-- Authenticated functions (called by users with internal authorization):
--   - start_intervention
--   - complete_intervention
--   - dismiss_intervention
--   - reassign_intervention
--   - notify_parent_for_intervention

-- ===========================================================================
-- Service-role-only RPCs
-- ===========================================================================

-- Insights recompute dispatcher (called by pg_cron)
REVOKE ALL ON FUNCTION public.insights_recompute_dispatch() FROM PUBLIC, anon, authenticated;
-- Only service_role can call this

-- Insights recompute worker functions (called by Edge Function with service_role)
REVOKE ALL ON FUNCTION public.claim_insight_run_chunk(uuid, date, int, int, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_insight_run(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_insight_run_counter(uuid, text) FROM PUBLIC, anon, authenticated;

-- Intervention creation (called by insights recompute Edge Function)
REVOKE ALL ON FUNCTION public.create_intervention_if_qualifying(uuid) FROM PUBLIC, anon, authenticated;

-- Advisory lock helper (internal use only)
REVOKE ALL ON FUNCTION public.pg_advisory_xact_lock(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- Authenticated RPCs (with call-site authorization)
-- ===========================================================================

-- Intervention lifecycle RPCs (teachers/admin can call with proper authorization)
REVOKE ALL ON FUNCTION public.start_intervention(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_intervention(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_intervention(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_intervention(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.dismiss_intervention(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_intervention(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reassign_intervention(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_intervention(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_parent_for_intervention(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_parent_for_intervention(uuid, uuid) TO authenticated;
