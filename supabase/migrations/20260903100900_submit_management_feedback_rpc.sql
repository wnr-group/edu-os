-- supabase/migrations/20260903100900_submit_management_feedback_rpc.sql
--
-- PR #25 review Comment #20 (and the earlier #8): thread_id was written
-- entirely by the client (apps/mobile/app/(parent)/more.tsx's
-- submitManagementFeedback did two plain .insert() calls, the second
-- carrying `thread_id: principalRow.id`). Any predicate added to
-- resolveFeedback's sibling query only narrows one exploit variant while
-- thread_id itself stays attacker-controllable — a parent can submit a
-- Message-Teacher row R_t, then a Contact-Management row with
-- `thread_id = R_t.id` (an id they already have), and get R_t's
-- notification silently marked read/rewritten via the sibling sweep.
--
-- Structural fix: thread_id is now assigned server-side, inside a
-- SECURITY DEFINER RPC that creates both Contact Management rows in one
-- call. A client can no longer choose which rows share a thread — the
-- value is a fresh gen_random_uuid() shared only between the two rows
-- this function itself creates in the same transaction.
CREATE OR REPLACE FUNCTION public.submit_management_feedback(p_subject text, p_message text)
RETURNS TABLE(principal_feedback_id uuid, school_admin_feedback_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_thread_id uuid := gen_random_uuid();
  v_subject text := btrim(p_subject);
  v_message text := btrim(p_message);
  v_principal_id uuid;
  v_admin_id uuid;
BEGIN
  v_school_id := public.get_my_school_id();
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_subject = '' OR v_message = '' THEN RAISE EXCEPTION 'invalid_subject'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'feedback') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  INSERT INTO public.feedback (school_id, from_user_id, to_role, subject, message, status, thread_id)
  VALUES (v_school_id, auth.uid(), 'principal', v_subject, v_message, 'open', v_thread_id)
  RETURNING id INTO v_principal_id;

  INSERT INTO public.feedback (school_id, from_user_id, to_role, subject, message, status, thread_id)
  VALUES (v_school_id, auth.uid(), 'school_admin', v_subject, v_message, 'open', v_thread_id)
  RETURNING id INTO v_admin_id;

  RETURN QUERY SELECT v_principal_id, v_admin_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_management_feedback(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_management_feedback(text, text) TO authenticated;

-- Defense in depth alongside the RPC: an ordinary client insert (the
-- Message-Teacher flow, or any other future caller of this policy) can no
-- longer set thread_id at all. The RPC above runs SECURITY DEFINER and so
-- bypasses RLS for its own inserts, same as every other SECURITY DEFINER
-- RPC in this schema (approve_leave, verify_documents, ...) — this
-- restriction only ever applies to a direct client-side .insert() call.
DROP POLICY IF EXISTS "feedback_insert" ON public.feedback;
CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT
  WITH CHECK (
    public.feature_enabled(school_id,'feedback')
    AND school_id = public.get_my_school_id()
    AND thread_id IS NULL
  );
