-- supabase/migrations/20260903100700_approve_leave_restore_excused_backfill.sql
-- (renumbered from 20260825000000 — see review Comment 10; content unchanged
-- by the renumbering itself)
--
-- Regression fix: 20260903100400_leave_approval_class_teacher_only.sql
-- rewrote approve_leave() to tighten authorization (class-teacher-only +
-- super_admin), but in doing so it was built from a copy of the function
-- that predates 20260821000001_approve_leave_excused_backfill.sql — so it
-- silently dropped that migration's fix: creating a missing FULL_DAY
-- 'excused' attendance_records row for any leave date that has not yet been
-- marked. The enforce_excused_on_leave trigger (trg_zz_enforce_excused) only
-- fires on INSERT/UPDATE, so it cannot compensate for a row that was never
-- created — a bare UPDATE ... WHERE date BETWEEN ... matches zero rows for
-- an unmapped date and silently does nothing.
--
-- 20260903100400 (main's counterpart migration) must not be edited once
-- shared, so this migration is the union of both: the exact authorization
-- body from 20260903100400 (kept in sync — see review Comment 14's
-- feature_enabled('leave') gate, added to both) plus the backfill INSERT
-- logic from 20260821000001 (adapted to run unconditionally after
-- authorization succeeds, so it also covers a super_admin approver —
-- 20260903100400's own v_section_id is only computed inside the
-- non-super-admin authorization branch, so a separate lookup,
-- v_backfill_section_id, is used here rather than reusing it).

CREATE OR REPLACE FUNCTION public.approve_leave(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_from date;
  v_to date;
  v_status public.leave_status;
  v_school_id uuid;
  v_year_id uuid;
  v_section_id uuid;
  v_class_teacher_id uuid;
  v_is_super_admin boolean;
  v_is_school_staff boolean;
  v_backfill_section_id uuid;
BEGIN
  SELECT lr.student_id, lr.from_date, lr.to_date, lr.status, lr.school_id
    INTO v_student, v_from, v_to, v_status, v_school_id
  FROM public.leave_requests lr WHERE lr.id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'leave') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  -- Authorization: same shape as 20260903100400_leave_approval_class_teacher_only.sql
  -- (as amended by this PR's own review-comment fixes) — this migration must
  -- carry the same school_admin/principal restoration and feature-flag gate,
  -- since it redefines approve_leave() again, later in the replay order, and
  -- would otherwise silently revert those fixes.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true AND ur.role = 'super_admin'
  ) INTO v_is_super_admin;

  v_is_school_staff := COALESCE(
    public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id(),
    false
  );

  IF NOT COALESCE(v_is_super_admin, false) AND NOT v_is_school_staff THEN
    SELECT ay.id INTO v_year_id FROM public.academic_years ay WHERE ay.school_id = v_school_id AND ay.status = 'active' LIMIT 1;
    SELECT se.section_id INTO v_section_id FROM public.student_enrollments se
      WHERE se.student_profile_id = v_student AND se.academic_year_id = v_year_id AND se.is_active = true;
    SELECT sa.class_teacher_id INTO v_class_teacher_id FROM public.section_assignments sa
      WHERE sa.section_id = v_section_id AND sa.academic_year_id = v_year_id;

    IF v_class_teacher_id IS NULL OR COALESCE(auth.uid() <> v_class_teacher_id, true) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;

  -- Backfill existing attendance rows for the leave date range to 'excused'
  -- (present in 20260903100400; kept unchanged).
  UPDATE public.attendance_records
  SET status = 'excused'
  WHERE student_id = v_student
    AND date BETWEEN v_from AND v_to;

  -- Restored from 20260821000001_approve_leave_excused_backfill.sql: get the
  -- student's active section (needed for the INSERT below), computed
  -- unconditionally so backfill also works when a super_admin approves.
  SELECT se.section_id INTO v_backfill_section_id
  FROM public.student_enrollments se
  WHERE se.student_profile_id = v_student AND se.is_active = true
  LIMIT 1;

  -- Restored from 20260821000001: insert EXCUSED rows for any leave dates
  -- not yet marked. ON CONFLICT DO NOTHING prevents duplicates (re-approval
  -- or race conditions) against the existing (student_id, date, session)
  -- unique constraint. Session is FULL_DAY because leave_session_scope only
  -- supports FULL_DAY.
  IF v_backfill_section_id IS NOT NULL THEN
    INSERT INTO public.attendance_records
      (school_id, student_id, section_id, date, session, status, marked_by)
    SELECT
      v_school_id,
      v_student,
      v_backfill_section_id,
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

REVOKE EXECUTE ON FUNCTION public.approve_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave(uuid) TO authenticated;
