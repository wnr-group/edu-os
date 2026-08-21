-- Migration: 20260821000002_backfill_approved_leave_excused.sql
--
-- One-time backfill: insert EXCUSED attendance rows for all approved leaves
-- that existed before 20260821000001 fixed approve_leave() to do this going
-- forward. Only inserts rows where no FULL_DAY row exists yet.
-- ON CONFLICT DO NOTHING guards against races or partial prior backfills.

INSERT INTO public.attendance_records
  (school_id, student_id, section_id, date, session, status, marked_by)
SELECT
  lr.school_id,
  lr.student_id,
  se.section_id,
  d.date::date,
  'FULL_DAY'::public.attendance_session,
  'excused'::public.attendance_status,
  lr.decided_by
FROM public.leave_requests lr
JOIN public.student_enrollments se
  ON se.student_profile_id = lr.student_id AND se.is_active = true
CROSS JOIN LATERAL generate_series(lr.from_date, lr.to_date, '1 day'::interval) AS d(date)
WHERE lr.status = 'approved'
  AND lr.decided_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.student_id = lr.student_id
      AND ar.date = d.date::date
      AND ar.session = 'FULL_DAY'::public.attendance_session
  )
ON CONFLICT (student_id, date, session) DO NOTHING;
