-- PTM Phase 2 — parent feedback read access.
--
-- No RLS policy is added to ptm_feedback for parents (deliberately — see
-- Phase 1's comment in ptm_rls.sql). RLS can't hide internal_notes on a
-- per-column basis, so parent access goes exclusively through this
-- STABLE SECURITY DEFINER RPC, which selects an explicit column list.
-- Mirrors get_quiz_for_attempt's contract in the Testing module: option
-- TEXT only, is_correct never returned — here, feedback content only,
-- internal_notes never returned.

CREATE OR REPLACE FUNCTION public.get_ptm_feedback_for_parent(p_meeting_id uuid)
RETURNS TABLE (
  summary text,
  academic_rating smallint,
  behavior_rating smallint,
  follow_up_required boolean,
  edited_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid; v_school_id uuid;
BEGIN
  SELECT student_id, school_id INTO v_student_id, v_school_id
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  RETURN QUERY
  SELECT f.summary, f.academic_rating, f.behavior_rating, f.follow_up_required, f.edited_at
  FROM public.ptm_feedback f
  WHERE f.meeting_id = p_meeting_id AND f.visible_to_parent = true;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_ptm_feedback_for_parent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ptm_feedback_for_parent(uuid) TO authenticated;
