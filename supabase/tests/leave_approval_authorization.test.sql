-- supabase/tests/leave_approval_authorization.test.sql
--
-- Regression test for PR #25 review Comment 2: 20260824130200 narrowed
-- approve_leave/reject_leave to super_admin + class-teacher only, silently
-- dropping the school-scoped school_admin/principal bypass that main (and
-- the live Admin/Principal Leave pages' Approve/Reject buttons) depend on.
-- Also covers review Comment 18's three gaps in the original version of
-- this file, and review Comment 14 (missing feature_enabled('leave') gate).
-- Proves:
--   1. same-school school_admin can approve.
--   2. same-school principal can reject.
--   3. a genuine DIFFERENT school's admin (a real seeded identity, not a
--      spoofed GUC with no user_roles row behind it) is denied
--      (cross-school protection is not weakened by restoring the bypass).
--   4. a teacher who is NOT the class teacher of this section is denied —
--      the actual headline change of 20260824130200 (narrowing from
--      teaches_student()/teaches_section(), which includes subject
--      teachers, to strictly class-teacher-only). This is the forbidden
--      half of that narrowing; the allowed half (class teacher can
--      approve) is already covered end-to-end by
--      leave_attendance_trigger.test.sql, not re-proven here.
--   5. approve_leave raises module_disabled when the school's `leave`
--      feature flag is off, even for an otherwise-authorized class teacher.
--
-- This file runs the whole way through as the `postgres` superuser (via
-- set_config, never `SET LOCAL ROLE authenticated`) — RLS on leave_requests
-- itself is NOT exercised here. That's deliberate: approve_leave/reject_leave
-- are SECURITY DEFINER and perform their own in-function authorization,
-- which is exactly what this file targets. It does not prove anything about
-- the leave_requests_select RLS policy.
--
-- Uses local seed: Demo School (aaaaaaaa-...0001, admin ...0011, principal
-- ...0012, teachers ...0014 class-teacher of Class1-A / ...0013 a different
-- teacher — verified against section_assignments, not assumed) and Demo
-- School Two (aaaaaaaa-...0000000000b2) for the cross-school negative case.
-- Section Class1-A (cccccccc-...0101), academic year aaaaaaaa-...0002.
--
-- Run: npx supabase db query --local -f supabase/tests/leave_approval_authorization.test.sql

BEGIN;

-- approve_leave/reject_leave now gate on feature_enabled(school_id, 'leave')
-- (review Comment 14) — the seeded Demo School has it off by default, so it
-- must be turned on for Cases 1-4; Case 5 below flips it off and back on
-- around its own assertion. guard_features_enabled (20260727132543) locks
-- toggle writes to super_admin/service_role, so app.role must claim
-- super_admin for each of these UPDATEs, same pattern as
-- mark_attendance_geo.test.sql. Rolled back with everything else.
SELECT set_config('app.role', 'super_admin', true);
UPDATE public.schools SET features_enabled = features_enabled || '{"leave": true}'::jsonb
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

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
-- A genuine seeded identity (Ravi Kumar, ...0013, already a real auth.users
-- row) temporarily granted a real school_admin row under Demo School Two —
-- not a spoofed GUC with no user_roles row behind it — so this proves what
-- an actual cross-tenant admin can do, not just that a malformed identity
-- fails. Rolled back with everything else at the end of this file.
INSERT INTO public.user_roles (user_id, school_id, role, is_active)
VALUES ('aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'school_admin', true);

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
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

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

-- ── Case 4: a teacher who is NOT the class teacher is denied ───────────────
-- ...0013 (Ravi Kumar) is a real Demo School One teacher but is not
-- section_assignments.class_teacher_id for Class1-A (...0014, Priya Nair,
-- is, confirmed by direct query rather than assumed) — this is the actual
-- headline narrowing of 20260903100400 (teaches_student()/teaches_section()
-- -> strictly class-teacher-only).
DO $$
DECLARE v_leave_id uuid;
BEGIN
  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-b000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000002', CURRENT_DATE + 8, CURRENT_DATE + 8, 'sick', 'pending',
     'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'teacher', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

  BEGIN
    PERFORM public.approve_leave(v_leave_id);
    RAISE EXCEPTION 'FAIL: non-class-teacher was able to approve';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: non-class-teacher denied (not_authorized)';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- ── Case 5: leave module disabled -> module_disabled, even for the class teacher ──
DO $$
DECLARE v_leave_id uuid;
BEGIN
  PERFORM set_config('app.role', 'super_admin', true);
  UPDATE public.schools SET features_enabled = features_enabled || '{"leave": false}'::jsonb
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  INSERT INTO public.leave_requests
    (school_id, student_id, academic_year_id, from_date, to_date, leave_type, status, requested_by)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-b000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000002', CURRENT_DATE + 9, CURRENT_DATE + 9, 'sick', 'pending',
     'aaaaaaaa-0000-0000-0000-000000000011')
  RETURNING id INTO v_leave_id;

  PERFORM set_config('app.role', 'teacher', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true); -- the real class teacher

  BEGIN
    PERFORM public.approve_leave(v_leave_id);
    RAISE EXCEPTION 'FAIL: approve_leave succeeded while the leave module is disabled';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'module_disabled' THEN
      RAISE NOTICE 'PASS: approve_leave denied while leave module disabled (module_disabled)';
    ELSE
      RAISE;
    END IF;
  END;

  PERFORM set_config('app.role', 'super_admin', true);
  UPDATE public.schools SET features_enabled = features_enabled || '{"leave": true}'::jsonb
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
END $$;

ROLLBACK;
