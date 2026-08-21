-- Migration: 20260821000003_approve_leave_absent.sql
--
-- Requirement change: approved-leave attendance must be 'absent', not 'excused'.
-- The parent attendance UI (attendance.tsx) only colors 'absent' red; 'excused'
-- falls through to grey and is invisible.
--
-- Changes:
-- 1. Drop the enforce_excused_on_leave trigger that overrides every write on
--    approved-leave dates to 'excused'. The teacher's attendance UI already
--    locks these rows, so server-side enforcement of 'absent' is not needed.
-- 2. Retroactively fix all 'excused' attendance_records to 'absent'.
-- 3. Replace approve_leave to INSERT/UPDATE 'absent' instead of 'excused'.

-- 1. Drop the trigger and its function.
DROP TRIGGER IF EXISTS trg_zz_enforce_excused ON public.attendance_records;
DROP FUNCTION IF EXISTS public.enforce_excused_on_leave();

-- 2. Fix all 'excused' attendance records to 'absent'.
--    'excused' can only have been written by the trigger or our previous
--    migrations — teachers have no UI path to set it manually.
UPDATE public.attendance_records
SET status = 'absent'
WHERE status = 'excused';

-- 3. Replace approve_leave: identical auth logic, now marks 'absent'.
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

  -- Update any already-recorded attendance for the leave date range to 'absent'.
  UPDATE public.attendance_records
  SET status = 'absent'
  WHERE student_id = v_student
    AND date BETWEEN v_from AND v_to;

  -- Get the student's active section enrollment.
  SELECT se.section_id INTO v_section_id
  FROM public.student_enrollments se
  WHERE se.student_profile_id = v_student AND se.is_active = true
  LIMIT 1;

  -- Insert 'absent' rows for leave dates not yet marked.
  -- ON CONFLICT DO NOTHING prevents duplicates on re-approval or race.
  -- academic_year_id is stamped automatically by trg_stamp_year (stamp_active_year).
  IF v_section_id IS NOT NULL THEN
    INSERT INTO public.attendance_records
      (school_id, student_id, section_id, date, session, status, marked_by)
    SELECT
      v_school_id,
      v_student,
      v_section_id,
      d.date::date,
      'FULL_DAY'::public.attendance_session,
      'absent'::public.attendance_status,
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
