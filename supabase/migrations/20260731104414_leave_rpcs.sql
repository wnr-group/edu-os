-- request_leave — parent side. Overlap guard blocks pending/approved overlaps only;
-- a rejected/cancelled prior request never blocks a new one.
CREATE OR REPLACE FUNCTION public.request_leave(
  p_student_id uuid, p_from date, p_to date, p_type public.leave_type, p_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_year_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'invalid_date_range';
  END IF;

  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id;

  SELECT academic_year_id INTO v_year_id
  FROM public.student_enrollments
  WHERE student_profile_id = p_student_id AND is_active = true
  ORDER BY created_at DESC LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE student_id = p_student_id
      AND status IN ('pending', 'approved')
      AND daterange(from_date, to_date, '[]') && daterange(p_from, p_to, '[]')
  ) THEN
    RAISE EXCEPTION 'overlapping_leave';
  END IF;

  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, note, status, requested_by)
  VALUES
    (v_school_id, p_student_id, v_year_id, p_from, p_to, p_type, NULLIF(btrim(p_note), ''), 'pending', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_leave(uuid, date, date, public.leave_type, text) TO authenticated;

-- approve_leave — approver side. Retroactively backfills any already-marked
-- days in range to 'excused' — the trigger (next migration) handles days
-- marked AFTER approval. Together, un-bypassable regardless of write order.
CREATE OR REPLACE FUNCTION public.approve_leave(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_from date;
  v_to date;
  v_status public.leave_status;
BEGIN
  SELECT student_id, from_date, to_date, status INTO v_student, v_from, v_to, v_status
  FROM public.leave_requests WHERE id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT (public.teaches_student(v_student) OR public.get_my_role() IN ('principal', 'school_admin')) THEN
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

-- reject_leave — no attendance footprint (D16).
CREATE OR REPLACE FUNCTION public.reject_leave(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_status public.leave_status;
BEGIN
  SELECT student_id, status INTO v_student, v_status FROM public.leave_requests WHERE id = p_request_id;
  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT (public.teaches_student(v_student) OR public.get_my_role() IN ('principal', 'school_admin')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.leave_requests
  SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(p_reason), '')
  WHERE id = p_request_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.reject_leave(uuid, text) TO authenticated;

-- cancel_leave — parent, pending-only.
CREATE OR REPLACE FUNCTION public.cancel_leave(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_status public.leave_status;
BEGIN
  SELECT student_id, status INTO v_student, v_status FROM public.leave_requests WHERE id = p_request_id;
  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  UPDATE public.leave_requests SET status = 'cancelled' WHERE id = p_request_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_leave(uuid) TO authenticated;