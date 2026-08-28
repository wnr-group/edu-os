-- supabase/tests/leave_approval_authorization.test.sql
--
-- Regression test for PR #25 review Comment 2: 20260824130200 narrowed
-- approve_leave/reject_leave to super_admin + class-teacher only, silently
-- dropping the school-scoped school_admin/principal bypass that main (and
-- the live Admin/Principal Leave pages' Approve/Reject buttons) depend on.
-- Proves:
--   1. same-school school_admin can approve.
--   2. same-school principal can reject.
--   3. a DIFFERENT school's admin is denied (cross-school protection is not
--      weakened by restoring the bypass).
--   4. the class-teacher path (already covered end-to-end by
--      leave_attendance_trigger.test.sql) still exists structurally — not
--      re-proven here to avoid duplicating that file's coverage.
--
-- Uses local seed: Demo School (aaaaaaaa-...0001, admin ...0011, principal
-- ...0012) and Demo School Two (aaaaaaaa-...0000000000b2) for the
-- cross-school negative case. Section Class1-A (cccccccc-...0101),
-- academic year aaaaaaaa-...0002.
--
-- Run: npx supabase db query --local -f supabase/tests/leave_approval_authorization.test.sql

BEGIN;

-- Dedicated fixture student/enrollment so this test doesn't depend on the
-- seed's randomized bulk enrollment generator.
INSERT INTO public.student_profiles (id, school_id, full_name, parent_profile_id)
VALUES ('dddddddd-b000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Leave Approval Test Student', NULL);

INSERT INTO public.student_enrollments (student_profile_id, school_id, class_id, section_id, academic_year_id, is_active)
VALUES ('dddddddd-b000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000101',
        'aaaaaaaa-0000-0000-0000-000000000002', true);

-- ── Case 1: same-school school_admin can approve ────────────────────────────
DO $$
DECLARE v_leave_id uuid;
BEGIN
  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-b000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000002', CURRENT_DATE + 5, CURRENT_DATE + 5, 'sick', 'pending',
     'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'school_admin', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

  PERFORM public.approve_leave(v_leave_id);

  IF (SELECT status FROM public.leave_requests WHERE id = v_leave_id) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL: same-school school_admin could not approve';
  END IF;
  RAISE NOTICE 'PASS: same-school school_admin can approve';
END $$;

-- ── Case 2: same-school principal can reject ────────────────────────────────
DO $$
DECLARE v_leave_id uuid;
BEGIN
  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-b000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000002', CURRENT_DATE + 6, CURRENT_DATE + 6, 'casual', 'pending',
     'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'principal', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000012"}', true);

  PERFORM public.reject_leave(v_leave_id, 'test rejection');

  IF (SELECT status FROM public.leave_requests WHERE id = v_leave_id) <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL: same-school principal could not reject';
  END IF;
  RAISE NOTICE 'PASS: same-school principal can reject';
END $$;

-- ── Case 3: a DIFFERENT school's admin is denied (cross-school protection) ──
DO $$
DECLARE v_leave_id uuid;
BEGIN
  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-b000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000002', CURRENT_DATE + 7, CURRENT_DATE + 7, 'sick', 'pending',
     'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'school_admin', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-0000000000b2', true); -- Demo School Two
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000099"}', true);

  BEGIN
    PERFORM public.approve_leave(v_leave_id);
    RAISE EXCEPTION 'FAIL: cross-school admin was able to approve';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: cross-school admin denied (not_authorized)';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

ROLLBACK;
