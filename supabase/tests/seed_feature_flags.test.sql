-- Seed regression test: Demo School must have the complete feature flag set.
--
-- PR #26 introduced an explicit features_enabled JSON for Demo School in seed.sql.
-- Because seed_features_enabled() only fires when features_enabled IS NULL or '{}',
-- a partial JSON bypasses the trigger and silently drops all other default modules.
-- This test catches that regression.
--
-- If this test fails, fix seed.sql — do NOT weaken RLS or remove feature gates.

BEGIN;

DO $$
DECLARE
  v_flags   JSONB;
  v_missing TEXT[] := '{}';
  f         TEXT;
  expected  TEXT[] := ARRAY[
    'attendance', 'homework', 'exams', 'report_cards',
    'syllabus', 'timetable', 'fees', 'announcements',
    'gallery', 'feedback', 'discipline',
    'attendance_geo', 'insights'
  ];
  must_be_true TEXT[] := ARRAY[
    'attendance', 'homework', 'exams', 'report_cards',
    'syllabus', 'timetable', 'fees', 'announcements',
    'gallery', 'feedback', 'discipline',
    'attendance_geo', 'insights'
  ];
BEGIN
  SELECT features_enabled INTO v_flags
  FROM public.schools
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  IF v_flags IS NULL THEN
    RAISE EXCEPTION 'FAIL: Demo School not found or features_enabled is NULL';
  END IF;

  -- Check every required key is present and truthy where expected
  FOREACH f IN ARRAY must_be_true LOOP
    IF NOT COALESCE((v_flags ->> f)::boolean, false) THEN
      v_missing := v_missing || f;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL: Demo School missing or false for required feature flags: %. '
      'Fix seed.sql to include the complete feature set. '
      'Current features_enabled: %',
      array_to_string(v_missing, ', '), v_flags;
  END IF;

  RAISE NOTICE 'PASS: Demo School has all required feature flags enabled. features_enabled=%', v_flags;
END $$;

ROLLBACK;
