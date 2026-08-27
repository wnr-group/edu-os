-- PTM Phase 1 — table + EXECUTE grants. This branch has no
-- ALTER DEFAULT PRIVILEGES bootstrap (that lives only on fix/auth-permissions,
-- not merged here), so every new table needs its own explicit GRANT, same as
-- 20260815100500_testing_grants.sql did for the Testing module. Only SELECT
-- is granted — both tables are SELECT-only at the RLS layer; all writes go
-- through the SECURITY DEFINER RPCs below, which run as the function owner
-- and don't need table-level INSERT/UPDATE grants to authenticated.
GRANT SELECT ON public.ptm_meetings TO authenticated, service_role;
GRANT SELECT ON public.ptm_feedback TO authenticated, service_role;

-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- PostgREST exposes everything in the public schema as an API endpoint
-- regardless of naming — REVOKE FROM PUBLIC, anon is required alongside
-- every GRANT below, or these are callable with just the anon key, no login.
REVOKE EXECUTE ON FUNCTION public.schedule_ptm_meeting(
  uuid, uuid, uuid, date, time, uuid, smallint, public.ptm_meeting_mode, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_ptm_meeting(
  uuid, uuid, uuid, date, time, uuid, smallint, public.ptm_meeting_mode, text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reschedule_ptm_meeting(uuid, date, time, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_ptm_meeting(uuid, date, time, smallint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_ptm_meeting(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_ptm_meeting(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_ptm_completed(uuid, public.ptm_meeting_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_ptm_completed(uuid, public.ptm_meeting_status) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_ptm_feedback(
  uuid, text, boolean, text, smallint, smallint, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ptm_feedback(
  uuid, text, boolean, text, smallint, smallint, boolean
) TO authenticated;
