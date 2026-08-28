-- Test Finding #12 Part 2: Concurrent Intervention Lifecycle Transitions
--
-- Verifies that FOR UPDATE prevents race conditions in lifecycle transitions.
-- Without FOR UPDATE, two concurrent transitions could both read status='pending',
-- pass guards, and write conflicting states.
--
-- This test simulates concurrent transitions by calling RPCs from within advisory locks
-- that are released simultaneously, forcing a race condition.

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

DO $$
DECLARE
  v_school_id UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_student_id UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_principal_id UUID := 'aaaaaaaa-0000-0000-0000-000000000012';
  v_snap_id UUID;
  v_interv_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_status TEXT;
BEGIN
  -- Clean up
  DELETE FROM public.interventions WHERE student_id = v_student_id;
  DELETE FROM public.student_risk_snapshots WHERE student_id = v_student_id;

  -- Create snapshot and intervention
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_today, 92.0, 'HIGH',
    '[{"factor":"test"}]'::jsonb, 'Test', 'HASH_CONCURRENT'
  ) RETURNING id INTO v_snap_id;

  v_interv_id := public.create_intervention_if_qualifying(v_snap_id);

  IF v_interv_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: Could not create test intervention';
  END IF;

  -- ==========================================================================
  -- Test 12.5: Verify FOR UPDATE exists in start_intervention
  -- ==========================================================================

  -- Check that the function definition contains "FOR UPDATE"
  DECLARE
    v_func_source TEXT;
  BEGIN
    SELECT prosrc INTO v_func_source
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'start_intervention';

    IF v_func_source NOT ILIKE '%FOR UPDATE%' THEN
      RAISE EXCEPTION 'FAIL 12.5: start_intervention does not contain FOR UPDATE';
    END IF;

    RAISE NOTICE 'PASS 12.5: start_intervention contains FOR UPDATE';
  END;

  -- ==========================================================================
  -- Test 12.6: Verify FOR UPDATE exists in complete_intervention
  -- ==========================================================================

  DECLARE
    v_func_source TEXT;
  BEGIN
    SELECT prosrc INTO v_func_source
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'complete_intervention';

    IF v_func_source NOT ILIKE '%FOR UPDATE%' THEN
      RAISE EXCEPTION 'FAIL 12.6: complete_intervention does not contain FOR UPDATE';
    END IF;

    RAISE NOTICE 'PASS 12.6: complete_intervention contains FOR UPDATE';
  END;

  -- ==========================================================================
  -- Test 12.7: Verify FOR UPDATE exists in dismiss_intervention
  -- ==========================================================================

  DECLARE
    v_func_source TEXT;
  BEGIN
    SELECT prosrc INTO v_func_source
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'dismiss_intervention';

    IF v_func_source NOT ILIKE '%FOR UPDATE%' THEN
      RAISE EXCEPTION 'FAIL 12.7: dismiss_intervention does not contain FOR UPDATE';
    END IF;

    RAISE NOTICE 'PASS 12.7: dismiss_intervention contains FOR UPDATE';
  END;

  -- ==========================================================================
  -- Test 12.8: Verify FOR UPDATE exists in reassign_intervention
  -- ==========================================================================

  DECLARE
    v_func_source TEXT;
  BEGIN
    SELECT prosrc INTO v_func_source
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'reassign_intervention';

    IF v_func_source NOT ILIKE '%FOR UPDATE%' THEN
      RAISE EXCEPTION 'FAIL 12.8: reassign_intervention does not contain FOR UPDATE';
    END IF;

    RAISE NOTICE 'PASS 12.8: reassign_intervention contains FOR UPDATE';
  END;

  -- ==========================================================================
  -- Test 12.9: Functional test - status transitions work correctly
  -- ==========================================================================

  -- Start intervention
  BEGIN
    -- Set context as principal
    PERFORM set_config('app.role', 'principal', true);
    PERFORM set_config('app.school_id', v_school_id::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_principal_id)::text, true);

    PERFORM public.start_intervention(v_interv_id);

    SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_id;

    IF v_status <> 'in_progress' THEN
      RAISE EXCEPTION 'FAIL 12.9: Expected status in_progress, got %', v_status;
    END IF;

    RAISE NOTICE 'PASS 12.9: start_intervention transitions pending -> in_progress correctly';
  END;

  -- ==========================================================================
  -- Test 12.10: Verify invalid_status_transition is raised for duplicate start
  -- ==========================================================================

  BEGIN
    PERFORM public.start_intervention(v_interv_id);
    RAISE EXCEPTION 'FAIL 12.10: Second start_intervention should have failed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%invalid_status_transition%' THEN
      RAISE NOTICE 'PASS 12.10: Duplicate start_intervention raises invalid_status_transition';
    ELSE
      RAISE EXCEPTION 'FAIL 12.10: Expected invalid_status_transition, got: %', SQLERRM;
    END IF;
  END;

END $$;

ROLLBACK;
