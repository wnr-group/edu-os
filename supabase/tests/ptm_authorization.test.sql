-- supabase/tests/ptm_authorization.test.sql
--
-- Regression tests for PR #24 review comments on PTM RPC authorization:
--   1. schedule_ptm_meeting must reject an admin/principal from a different
--      school (cross-school escalation: SECURITY DEFINER bypasses RLS, and
--      v_school_id is derived from the caller-supplied student_id, not the
--      caller's own session — the school_admin/principal branch must also
--      compare against get_my_school_id()).
--   2. schedule_ptm_meeting must reject a student_id/section_id pair that
--      don't actually match (student not enrolled in the given section).
--   4. schedule_ptm_meeting / reschedule_ptm_meeting / cancel_ptm_meeting /
--      mark_ptm_completed must fail CLOSED (not_authorized), not open, when
--      the caller's role can't be resolved (app.role GUC unset/NULL — the
--      real-world case is an unvalidated x-school-id/x-active-role header).
--
-- Uses local seed: Demo School (aaaaaaaa-...0001) and Demo School Two
-- (aaaaaaaa-...0000000000b2), section Class1-A (cccccccc-...0101, academic
-- year aaaaaaaa-...0002, class teacher aaaaaaaa-...0014 per
-- section_assignments). Two dedicated student/enrollment fixtures are
-- inserted below (Section 1A vs Section 5A) so the mismatch case exercises
-- a real, deterministic enrollment relationship rather than the seed's
-- randomized bulk enrollment generator.
--
-- Run: npx supabase db query --local -f supabase/tests/ptm_authorization.test.sql

BEGIN;

UPDATE public.schools SET features_enabled = features_enabled || '{"ptm": true}'::jsonb
WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000b2');

INSERT INTO public.student_profiles (id, school_id, full_name, parent_profile_id)
VALUES
  ('dddddddd-a000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'PTM Test Student A (Section 1A)', NULL),
  ('dddddddd-a000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'PTM Test Student B (Section 5A)', NULL);

INSERT INTO public.student_enrollments (student_profile_id, school_id, class_id, section_id, academic_year_id, is_active)
VALUES
  ('dddddddd-a000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000101',
   'aaaaaaaa-0000-0000-0000-000000000002', true),
  ('dddddddd-a000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000501',
   'aaaaaaaa-0000-0000-0000-000000000002', true);

-- ── Case 1a: cross-school school_admin is DENIED (Comment 1) ───────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-0000000000b2', true); -- Demo School Two
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000099"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.schedule_ptm_meeting(
      'dddddddd-a000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000014',
      'cccccccc-0000-0000-0000-000000000101', CURRENT_DATE + 5, '10:00'::time
    );
    RAISE EXCEPTION 'FAIL: cross-school school_admin was able to schedule a PTM meeting';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: cross-school school_admin denied (not_authorized)';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

-- ── Case 1b: same-school school_admin is ALLOWED (fix must not overblock) ──
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true); -- Demo School (student's real school)
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.schedule_ptm_meeting(
    'dddddddd-a000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000014',
    'cccccccc-0000-0000-0000-000000000101', CURRENT_DATE + 5, '12:00'::time
  );
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: same-school school_admin could not schedule a PTM meeting';
  END IF;
  RAISE NOTICE 'PASS: same-school school_admin can still schedule a PTM meeting';
END $$;
RESET ROLE;

-- ── Case 2: student not enrolled in the given section is DENIED (Comment 2) ─
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

DO $$
BEGIN
  BEGIN
    -- Student B is enrolled in Section 5A, not Section 1A — teacher ...0014
    -- genuinely teaches 1A, so this isolates the student/section mismatch
    -- from the authorization check.
    PERFORM public.schedule_ptm_meeting(
      'dddddddd-a000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000014',
      'cccccccc-0000-0000-0000-000000000101', CURRENT_DATE + 5, '13:00'::time
    );
    RAISE EXCEPTION 'FAIL: scheduled a meeting for a student not enrolled in the given section';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'student_not_in_section' THEN
      RAISE NOTICE 'PASS: student/section mismatch denied (student_not_in_section)';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

-- ── Case 3: unresolved role fails CLOSED across all 4 RPCs (Comment 4) ─────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

DO $$
DECLARE v_meeting_id uuid;
BEGIN
  -- Legitimately schedule a real meeting first, so reschedule/cancel/
  -- mark_ptm_completed below have something real to target.
  v_meeting_id := public.schedule_ptm_meeting(
    'dddddddd-a000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000014',
    'cccccccc-0000-0000-0000-000000000101', CURRENT_DATE + 5, '14:00'::time
  );

  -- Simulate an unresolved scope: a real logged-in user (sub still set) but
  -- app.role/app.school_id unset — exactly what scope_pre_request() leaves
  -- when it can't validate the x-school-id/x-active-role headers. The caller
  -- is switched to a different real user (...0011) who is NOT this meeting's
  -- own teacher (...0014) — reschedule/cancel/mark_ptm_completed also have a
  -- role-independent `auth.uid() = v_teacher_id` bypass for the meeting's
  -- own teacher, which would legitimately succeed regardless of role
  -- resolution and mask the exact gap Comment 4 is about.
  PERFORM set_config('app.role', NULL, true);
  PERFORM set_config('app.school_id', NULL, true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

  BEGIN
    PERFORM public.schedule_ptm_meeting(
      'dddddddd-a000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000014',
      'cccccccc-0000-0000-0000-000000000101', CURRENT_DATE + 6, '14:00'::time
    );
    RAISE EXCEPTION 'FAIL: schedule_ptm_meeting succeeded with an unresolved role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: schedule_ptm_meeting fails closed on unresolved role';
    ELSE
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.reschedule_ptm_meeting(v_meeting_id, CURRENT_DATE + 7, '14:00'::time, NULL);
    RAISE EXCEPTION 'FAIL: reschedule_ptm_meeting succeeded with an unresolved role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: reschedule_ptm_meeting fails closed on unresolved role';
    ELSE
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.cancel_ptm_meeting(v_meeting_id, 'test');
    RAISE EXCEPTION 'FAIL: cancel_ptm_meeting succeeded with an unresolved role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: cancel_ptm_meeting fails closed on unresolved role';
    ELSE
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.mark_ptm_completed(v_meeting_id, 'completed'::public.ptm_meeting_status);
    RAISE EXCEPTION 'FAIL: mark_ptm_completed succeeded with an unresolved role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: mark_ptm_completed fails closed on unresolved role';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

ROLLBACK;
