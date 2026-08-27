-- Migration: 20260824153000_revoke_anon_rpc_privileges.sql
--
-- Explicitly revoke EXECUTE privileges on sensitive RPCs from PUBLIC and anon,
-- and grant EXECUTE to authenticated, ensuring strict call-site authorization.

REVOKE ALL ON FUNCTION public.get_student_kyc_checklist(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_kyc_checklist(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_homework(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_homework(uuid, uuid, text, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_kyc_document(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_kyc_document(uuid, uuid, text, text, text, integer) TO authenticated;
