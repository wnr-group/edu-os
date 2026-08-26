-- Regression test for EDUOS-2026-08-18-09: parent fee visibility + isolation.
-- The confirmed root cause was client-side (ThemeProvider's feature-flag
-- fetch had no retry, so a single transient failure permanently stranded
-- useFeature("fees") at false) — not RLS or data. This test proves the
-- server-side data path itself is correct: fee data exists, is retrievable
-- by the correct parent, and is NOT visible for other students.
-- Uses local seed's Demo School / student dddddddd-...0001 (Aryan Sharma) /
-- parent aaaaaaaa-...0030.
-- Run: npx supabase db query --local -f supabase/tests/fee_visibility_isolation.test.sql

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE
  v_flag text;
  v_count int;
  v_other_count int;
BEGIN
  -- AC-04: applicable fee data exists and is retrievable (school features flag).
  SELECT features_enabled ->> 'fees' INTO v_flag
  FROM public.schools WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v_flag IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FAIL: expected schools.features_enabled.fees = true, got %', v_flag;
  END IF;
  RAISE NOTICE 'PASS: fees feature flag is true for the seeded school';

  -- AC-04/AC-05: fee_line_items are retrievable for the correct student.
  SELECT count(*) INTO v_count FROM public.fee_line_items WHERE student_id = 'dddddddd-0000-0000-0000-000000000001';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected 2 fee_line_items for the correct student, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: parent retrieves exactly % fee_line_items for their own child', v_count;

  -- AC-06: student isolation — parent cannot see any other student's fee_line_items.
  SELECT count(*) INTO v_other_count FROM public.fee_line_items WHERE student_id != 'dddddddd-0000-0000-0000-000000000001';
  IF v_other_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: parent could see % fee_line_items belonging to other students', v_other_count;
  END IF;
  RAISE NOTICE 'PASS: parent cannot see any other students'' fee_line_items (RLS isolation holds)';
END $$;

ROLLBACK;
