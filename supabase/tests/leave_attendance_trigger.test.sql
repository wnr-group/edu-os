-- Regression test for EDUOS-2026-08-18-06: Leave -> Attendance integration.
-- Expected behavior (migration 20260821000003): approved leave dates are marked
-- 'absent' (not 'excused'). The enforce_excused_on_leave trigger has been
-- dropped; approve_leave directly inserts/updates 'absent'.
--
-- Two scenarios:
--   1. attendance NOT yet marked when leave is approved → approve_leave INSERTs
--      'absent' row immediately (backfill INSERT path)
--   2. attendance already marked BEFORE leave is approved → approve_leave
--      UPDATEs existing row to 'absent' (retroactive UPDATE path)
--
-- Uses local seed: Demo School / section Class1-A / class teacher aaaaaaaa-0014.
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/leave_attendance_trigger.test.sql

BEGIN;

-- ── Scenario 1: attendance NOT yet marked when leave is approved ─────────────
DO $$
DECLARE
  v_student    uuid;
  v_leave_id   uuid;
  v_status     public.attendance_status;
  v_count      int;
BEGIN
  SELECT se.student_profile_id INTO v_student
  FROM public.student_enrollments se
  WHERE se.section_id = 'cccccccc-0000-0000-0000-000000000101' AND se.is_active = true
  ORDER BY se.created_at LIMIT 1;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'FAIL: no enrolled student found in fixture section';
  END IF;

  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', v_student, 'aaaaaaaa-0000-0000-0000-000000000002',
     CURRENT_DATE + 3, CURRENT_DATE + 4, 'sick', 'pending', 'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'school_admin', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

  PERFORM public.approve_leave(v_leave_id);

  -- approve_leave must INSERT 'absent' immediately for unmapped leave dates.
  SELECT status INTO v_status
  FROM public.attendance_records
  WHERE student_id = v_student AND date = CURRENT_DATE + 3 AND session = 'FULL_DAY';

  IF v_status IS DISTINCT FROM 'absent' THEN
    RAISE EXCEPTION 'FAIL: expected absent for unmapped leave date, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS: approve_leave INSERTs absent row immediately for unmapped leave date';

  -- Both leave dates must be covered.
  SELECT count(*) INTO v_count
  FROM public.attendance_records
  WHERE student_id = v_student
    AND date BETWEEN CURRENT_DATE + 3 AND CURRENT_DATE + 4
    AND session = 'FULL_DAY' AND status = 'absent';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected 2 absent rows for 2-day leave, found %', v_count;
  END IF;
  RAISE NOTICE 'PASS: both leave dates have absent rows (multi-day)';

  -- No duplicate records for the same student/date.
  SELECT count(*) INTO v_count
  FROM public.attendance_records
  WHERE student_id = v_student AND date = CURRENT_DATE + 3;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 row for leave date, found %', v_count;
  END IF;
  RAISE NOTICE 'PASS: no duplicate attendance_records for the same student/date';
END $$;

-- ── Scenario 2: attendance already marked BEFORE leave is approved ───────────
DO $$
DECLARE
  v_student  uuid;
  v_leave_id uuid;
  v_status   public.attendance_status;
BEGIN
  SELECT se.student_profile_id INTO v_student
  FROM public.student_enrollments se
  WHERE se.section_id = 'cccccccc-0000-0000-0000-000000000101' AND se.is_active = true
  ORDER BY se.created_at DESC LIMIT 1;

  PERFORM set_config('app.role', 'teacher', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

  -- Teacher marks student absent before the leave is requested/approved.
  PERFORM public.mark_attendance(
    'cccccccc-0000-0000-0000-000000000101'::uuid,
    'FULL_DAY'::public.attendance_session,
    (CURRENT_DATE + 6)::date,
    jsonb_build_array(jsonb_build_object('student_id', v_student, 'status', 'absent'))
  );

  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', v_student, 'aaaaaaaa-0000-0000-0000-000000000002',
     CURRENT_DATE + 6, CURRENT_DATE + 6, 'casual', 'pending', 'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'school_admin', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);
  PERFORM public.approve_leave(v_leave_id);

  SELECT status INTO v_status
  FROM public.attendance_records
  WHERE student_id = v_student AND date = CURRENT_DATE + 6 AND session = 'FULL_DAY';

  IF v_status IS DISTINCT FROM 'absent' THEN
    RAISE EXCEPTION 'FAIL: approve_leave did not keep already-marked day as absent; status = %', v_status;
  END IF;
  RAISE NOTICE 'PASS: approve_leave retroactively sets already-marked day to absent (approve-after-mark path)';
END $$;

ROLLBACK;
