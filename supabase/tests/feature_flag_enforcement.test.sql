-- Test Finding #5: Verify insights feature flag blocks reads/writes when disabled
--
-- Expected Behavior:
-- 1. When feature_enabled(school_id, 'insights') = true → teachers/principals can read interventions/snapshots
-- 2. When feature_enabled(school_id, 'insights') = false → teachers/principals CANNOT read (0 rows)
-- 3. super_admin can always read regardless of flag

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

DO $$
DECLARE
  v_school_1 UUID := 'aaaaaaaa-0000-0000-0000-000000000001';  -- Demo school (insights=true)
  v_school_2 UUID := 'aaaaaaaa-0000-0000-0000-0000000000b2';  -- Test school 2 (will disable)
  v_student_1 UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_teacher_1 UUID := 'aaaaaaaa-0000-0000-0000-000000000013';  -- 8A teacher
  v_principal_1 UUID := 'aaaaaaaa-0000-0000-0000-000000000012';
  v_snap_id UUID;
  v_interv_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_count INT;
BEGIN
  -- Ensure School 1 has insights enabled
  UPDATE public.schools
  SET features_enabled = jsonb_set(
    COALESCE(features_enabled, '{}'::jsonb),
    '{insights}',
    'true'::jsonb
  )
  WHERE id = v_school_1;

  -- Create School 2 if not exists and enable insights temporarily
  INSERT INTO public.schools (id, name, features_enabled)
  VALUES (
    v_school_2,
    'Test School 2 Feature Flag',
    '{"insights": true}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET features_enabled = '{"insights": true}'::jsonb;

  -- Delete any existing test data first
  DELETE FROM public.interventions
  WHERE student_id = v_student_1 AND kind = 'attendance';

  DELETE FROM public.student_risk_snapshots
  WHERE school_id = v_school_1 AND student_id = v_student_1 AND kind = 'attendance';

  -- Seed a snapshot and intervention in School 1
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_1, v_student_1, 'attendance', v_today, 88.50, 'HIGH',
    '[{"factor":"streak","detail":"3 days","weight":0.4}]'::jsonb,
    'Call parent', 'TEST_HASH'
  ) RETURNING id INTO v_snap_id;

  v_interv_id := public.create_intervention_if_qualifying(v_snap_id);

  IF v_interv_id IS NULL THEN
    -- May already exist from previous tests
    SELECT id INTO v_interv_id FROM public.interventions
    WHERE student_id = v_student_1 AND kind = 'attendance' AND status IN ('pending','in_progress')
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Setup complete: snapshot=%, intervention=%', v_snap_id, v_interv_id;
END $$;

-- ============================================================================
-- Test 5.1: Teacher can read snapshots when insights=true
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 5.1: Teacher cannot read snapshots even though insights=true';
  END IF;
  RAISE NOTICE 'PASS 5.1: Teacher can read % snapshot(s) when insights=true', v_count;
END $$;

-- Test 5.2: Teacher can read interventions when insights=true
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.interventions;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 5.2: Teacher cannot read interventions even though insights=true';
  END IF;
  RAISE NOTICE 'PASS 5.2: Teacher can read % intervention(s) when insights=true', v_count;
END $$;

RESET ROLE;

-- ============================================================================
-- Test 5.3 & 5.4: Disable insights flag and verify blocking
-- ============================================================================

-- Disable insights feature for School 1 (must be done as postgres/super_admin)
-- The guard_features_enabled() trigger allows service_role or postgres
DO $$
BEGIN
  -- Temporarily disable the trigger for this test
  ALTER TABLE public.schools DISABLE TRIGGER trg_guard_features;

  UPDATE public.schools
  SET features_enabled = jsonb_set(
    COALESCE(features_enabled, '{}'::jsonb),
    '{insights}',
    'false'::jsonb
  )
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  ALTER TABLE public.schools ENABLE TRIGGER trg_guard_features;
END $$;

-- Test 5.3: Teacher CANNOT read snapshots when insights=false
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 5.3: Teacher can still read % snapshot(s) even though insights=false', v_count;
  END IF;
  RAISE NOTICE 'PASS 5.3: Teacher blocked from snapshots when insights=false (0 rows)';
END $$;

-- Test 5.4: Teacher CANNOT read interventions when insights=false
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.interventions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 5.4: Teacher can still read % intervention(s) even though insights=false', v_count;
  END IF;
  RAISE NOTICE 'PASS 5.4: Teacher blocked from interventions when insights=false (0 rows)';
END $$;

RESET ROLE;

-- ============================================================================
-- Test 5.5: Principal CANNOT read when insights=false
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000012"}', true);

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.interventions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 5.5: Principal can still read % intervention(s) even though insights=false', v_count;
  END IF;
  RAISE NOTICE 'PASS 5.5: Principal blocked from interventions when insights=false (0 rows)';
END $$;

RESET ROLE;

-- ============================================================================
-- Test 5.6: super_admin can ALWAYS read regardless of flag
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', NULL, true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
  WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 5.6: super_admin cannot read snapshots even though they should bypass feature flag';
  END IF;
  RAISE NOTICE 'PASS 5.6: super_admin can read % snapshot(s) regardless of insights=false', v_count;
END $$;

RESET ROLE;

-- ============================================================================
-- Finding #4: RPC feature-flag tests for write operations
-- Tests that lifecycle RPCs raise 'module_disabled' when insights=false
-- and succeed when insights=true (positive control).
-- ============================================================================

-- At this point insights=false for School 1 (set in tests 5.3-5.5 above).
-- Teacher 1 is assignee for the intervention seeded in setup.

-- Test 5.7: start_intervention blocked when insights=false
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE
  v_interv_id UUID;
  v_blocked BOOLEAN := false;
BEGIN
  SELECT id INTO v_interv_id
  FROM public.interventions
  WHERE student_id = 'dddddddd-0000-0000-0000-000000000001'
    AND kind = 'attendance'
    AND status = 'pending'
  LIMIT 1;

  IF v_interv_id IS NULL THEN
    RAISE NOTICE 'SKIP 5.7: No pending intervention found (may have been started already)';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.start_intervention(v_interv_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'module_disabled' THEN
      v_blocked := true;
    ELSE
      RAISE EXCEPTION 'FAIL 5.7: start_intervention raised unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL 5.7: start_intervention succeeded but insights=false — module_disabled not raised';
  END IF;
  RAISE NOTICE 'PASS 5.7: start_intervention correctly raises module_disabled when insights=false';
END $$;

RESET ROLE;

-- Test 5.8: notify_parent_for_intervention blocked when insights=false
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE
  v_interv_id UUID;
  v_blocked BOOLEAN := false;
BEGIN
  SELECT id INTO v_interv_id
  FROM public.interventions
  WHERE student_id = 'dddddddd-0000-0000-0000-000000000001'
    AND kind = 'attendance'
  LIMIT 1;

  IF v_interv_id IS NULL THEN
    RAISE NOTICE 'SKIP 5.8: No intervention found for notify test';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.notify_parent_for_intervention(v_interv_id, auth.uid());
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'module_disabled' THEN
      v_blocked := true;
    ELSE
      RAISE EXCEPTION 'FAIL 5.8: notify_parent_for_intervention raised unexpected error (expected module_disabled): %', SQLERRM;
    END IF;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL 5.8: notify_parent_for_intervention succeeded but insights=false — module_disabled not raised';
  END IF;
  RAISE NOTICE 'PASS 5.8: notify_parent_for_intervention correctly raises module_disabled when insights=false';
END $$;

RESET ROLE;

-- ============================================================================
-- Re-enable insights for positive control tests (5.9-5.10)
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE public.schools DISABLE TRIGGER trg_guard_features;

  UPDATE public.schools
  SET features_enabled = jsonb_set(
    COALESCE(features_enabled, '{}'::jsonb),
    '{insights}',
    'true'::jsonb
  )
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  ALTER TABLE public.schools ENABLE TRIGGER trg_guard_features;
END $$;

-- Test 5.9 (positive control): start_intervention succeeds when insights=true
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE
  v_interv_id UUID;
  v_succeeded BOOLEAN := false;
BEGIN
  SELECT id INTO v_interv_id
  FROM public.interventions
  WHERE student_id = 'dddddddd-0000-0000-0000-000000000001'
    AND kind = 'attendance'
    AND status = 'pending'
  LIMIT 1;

  IF v_interv_id IS NULL THEN
    RAISE NOTICE 'SKIP 5.9: No pending intervention found for positive control';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.start_intervention(v_interv_id);
    v_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL 5.9: start_intervention raised error when insights=true: %', SQLERRM;
  END;

  IF NOT v_succeeded THEN
    RAISE EXCEPTION 'FAIL 5.9: start_intervention did not succeed when insights=true';
  END IF;
  RAISE NOTICE 'PASS 5.9: start_intervention succeeded (positive control) when insights=true';
END $$;

RESET ROLE;

-- Test 5.10: complete_intervention blocked when insights=false
DO $$
BEGIN
  ALTER TABLE public.schools DISABLE TRIGGER trg_guard_features;

  UPDATE public.schools
  SET features_enabled = jsonb_set(
    COALESCE(features_enabled, '{}'::jsonb),
    '{insights}',
    'false'::jsonb
  )
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  ALTER TABLE public.schools ENABLE TRIGGER trg_guard_features;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE
  v_interv_id UUID;
  v_blocked BOOLEAN := false;
BEGIN
  SELECT id INTO v_interv_id
  FROM public.interventions
  WHERE student_id = 'dddddddd-0000-0000-0000-000000000001'
    AND kind = 'attendance'
    AND status = 'in_progress'
  LIMIT 1;

  IF v_interv_id IS NULL THEN
    RAISE NOTICE 'SKIP 5.10: No in_progress intervention found for complete test';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.complete_intervention(v_interv_id, 'Test outcome note');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'module_disabled' THEN
      v_blocked := true;
    ELSE
      RAISE EXCEPTION 'FAIL 5.10: complete_intervention raised unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL 5.10: complete_intervention succeeded but insights=false — module_disabled not raised';
  END IF;
  RAISE NOTICE 'PASS 5.10: complete_intervention correctly raises module_disabled when insights=false';
END $$;

RESET ROLE;

-- ============================================================================
-- Cleanup: Re-enable insights for School 1 (restore original state)
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE public.schools DISABLE TRIGGER trg_guard_features;

  UPDATE public.schools
  SET features_enabled = jsonb_set(
    COALESCE(features_enabled, '{}'::jsonb),
    '{insights}',
    'true'::jsonb
  )
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  ALTER TABLE public.schools ENABLE TRIGGER trg_guard_features;
END $$;

ROLLBACK;
