-- Fixes approve_leave/reject_leave authorization:
--  1. Adds the missing super_admin bypass (every other RPC/RLS in this epic has one).
--  2. Adds school-scoping to the admin/principal branch (previously ungated —
--     any school's admin could approve any other school's leave request).
--  3. Replaces the GUC-based get_my_role() check with a direct user_roles
--     lookup on auth.uid(), matching the proven pattern already used in every
--     edge function this epic (publish-exam-datesheet, send-fee-reminder) —
--     this doesn't depend on request-scoped GUC/header context the way a
--     direct client-side .rpc() call may not populate identically to a full
--     page navigation.

CREATE OR REPLACE FUNCTION public.approve_leave(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_from date;
  v_to date;
  v_status public.leave_status;
  v_school_id uuid;
  v_authorized boolean;
BEGIN
  SELECT lr.student_id, lr.from_date, lr.to_date, lr.status, lr.school_id
    INTO v_student, v_from, v_to, v_status, v_school_id
  FROM public.leave_requests lr WHERE lr.id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND (
        ur.role = 'super_admin'
        OR (ur.school_id = v_school_id AND ur.role IN ('school_admin', 'principal'))
      )
  ) INTO v_authorized;

  IF NOT v_authorized AND NOT public.teaches_student(v_student) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;

  UPDATE public.attendance_records
  SET status = 'excused'
  WHERE student_id = v_student
    AND date BETWEEN v_from AND v_to;
END; $$;
GRANT EXECUTE ON FUNCTION public.approve_leave(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_leave(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_status public.leave_status;
  v_school_id uuid;
  v_authorized boolean;
BEGIN
  SELECT lr.student_id, lr.status, lr.school_id INTO v_student, v_status, v_school_id
  FROM public.leave_requests lr WHERE lr.id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND (
        ur.role = 'super_admin'
        OR (ur.school_id = v_school_id AND ur.role IN ('school_admin', 'principal'))
      )
  ) INTO v_authorized;

  IF NOT v_authorized AND NOT public.teaches_student(v_student) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.leave_requests
  SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(p_reason), '')
  WHERE id = p_request_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.reject_leave(uuid, text) TO authenticated;