-- Migration: 20260821000001_approve_leave_excused_backfill.sql
--
-- Bug: approve_leave only UPDATEs existing attendance_records rows for the
-- leave date range. If the teacher has not yet marked attendance for those
-- dates, 0 rows are updated and no EXCUSED record is created.  The
-- enforce_excused_on_leave trigger only fires on INSERT/UPDATE, so it cannot
-- compensate for missing rows.
--
-- Fix: after the existing UPDATE, INSERT a FULL_DAY EXCUSED row for every
-- date in [v_from, v_to] that has no attendance_records row yet.
-- ON CONFLICT DO NOTHING guards against duplicates (test-case D).
-- The trigger will override the status to 'excused' on any future write
-- anyway, so the INSERT is the only missing piece.
--
-- Authorization logic is preserved verbatim from 20260731112226_leave_rpcs_auth_fix.sql.

CREATE OR REPLACE FUNCTION public.approve_leave(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student    uuid;
  v_from       date;
  v_to         date;
  v_status     public.leave_status;
  v_school_id  uuid;
  v_section_id uuid;
  v_authorized boolean;
BEGIN
  SELECT lr.student_id, lr.from_date, lr.to_date, lr.status, lr.school_id
    INTO v_student, v_from, v_to, v_status, v_school_id
  FROM public.leave_requests lr WHERE lr.id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  -- Authorization: super_admin or school-scoped admin/principal (unchanged from auth-fix migration)
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

  -- Mark the leave request approved
  UPDATE public.leave_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;

  -- Backfill existing attendance rows for the leave date range to 'excused'
  UPDATE public.attendance_records
  SET status = 'excused'
  WHERE student_id = v_student
    AND date BETWEEN v_from AND v_to;

  -- Get the student's active section (needed for INSERT)
  SELECT se.section_id INTO v_section_id
  FROM public.student_enrollments se
  WHERE se.student_profile_id = v_student AND se.is_active = true
  LIMIT 1;

  -- If we have a section, insert EXCUSED rows for any dates not yet marked.
  -- ON CONFLICT DO NOTHING prevents duplicates (re-approval or race conditions).
  -- Session is FULL_DAY because leave_session_scope only supports FULL_DAY.
  IF v_section_id IS NOT NULL THEN
    INSERT INTO public.attendance_records
      (school_id, student_id, section_id, date, session, status, marked_by)
    SELECT
      v_school_id,
      v_student,
      v_section_id,
      d.date::date,
      'FULL_DAY'::public.attendance_session,
      'excused'::public.attendance_status,
      auth.uid()
    FROM generate_series(v_from, v_to, '1 day'::interval) AS d(date)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.attendance_records ar2
      WHERE ar2.student_id = v_student
        AND ar2.date = d.date::date
        AND ar2.session = 'FULL_DAY'::public.attendance_session
    )
    ON CONFLICT (student_id, date, session) DO NOTHING;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.approve_leave(uuid) TO authenticated;
