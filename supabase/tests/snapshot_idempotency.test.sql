-- Test Finding #12 Part 1: Snapshot Idempotency
--
-- Verifies that duplicate recomputation (same school/student/kind/date/subject) creates
-- only ONE snapshot due to unique partial indexes.
--
-- Expected: INSERT...ON CONFLICT works correctly, no duplicate snapshots

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

DO $$
DECLARE
  v_school_id UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_student_id UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_subject_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_snap_id_1 UUID;
  v_snap_id_2 UUID;
  v_count INT;
BEGIN
  -- Get a subject for academic tests
  SELECT id INTO v_subject_id FROM public.subjects
  WHERE school_id = v_school_id LIMIT 1;

  -- Clean up test data
  DELETE FROM public.interventions WHERE student_id = v_student_id;
  DELETE FROM public.student_risk_snapshots WHERE student_id = v_student_id;

  -- ==========================================================================
  -- Test 12.1: Attendance snapshot idempotency (NULL subject_id)
  -- ==========================================================================

  -- First insert
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_today, 88.0, 'HIGH',
    '[{"factor":"streak","value":3}]'::jsonb, 'Action 1', NULL, 'HASH1'
  ) RETURNING id INTO v_snap_id_1;

  -- Second insert with same key (should violate unique constraint if not using ON CONFLICT)
  BEGIN
    INSERT INTO public.student_risk_snapshots (
      school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
    ) VALUES (
      v_school_id, v_student_id, 'attendance', v_today, 90.0, 'HIGH',
      '[{"factor":"streak","value":4}]'::jsonb, 'Action 2', NULL, 'HASH2'
    );

    RAISE EXCEPTION 'FAIL 12.1: Duplicate attendance snapshot insert succeeded without ON CONFLICT';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 12.1: Attendance snapshot unique constraint enforced (unique_violation caught)';
  END;

  -- Verify idempotent upsert works
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_today, 92.0, 'HIGH',
    '[{"factor":"streak","value":5}]'::jsonb, 'Action 3', NULL, 'HASH3'
  )
  ON CONFLICT (school_id, student_id, kind, computed_for)
    WHERE subject_id IS NULL
  DO UPDATE SET
    score = EXCLUDED.score,
    band = EXCLUDED.band,
    factors = EXCLUDED.factors,
    recommended_action = EXCLUDED.recommended_action,
    params_hash = EXCLUDED.params_hash
  RETURNING id INTO v_snap_id_2;

  IF v_snap_id_1 <> v_snap_id_2 THEN
    RAISE EXCEPTION 'FAIL 12.2: ON CONFLICT created new row instead of updating (% vs %)', v_snap_id_1, v_snap_id_2;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.student_risk_snapshots
  WHERE school_id = v_school_id AND student_id = v_student_id AND kind = 'attendance' AND computed_for = v_today;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 12.2: Expected 1 attendance snapshot, found %', v_count;
  END IF;

  RAISE NOTICE 'PASS 12.2: Attendance snapshot ON CONFLICT upsert creates exactly 1 row';

  -- ==========================================================================
  -- Test 12.3: Academic snapshot idempotency (with subject_id)
  -- ==========================================================================

  -- Clean for academic test
  DELETE FROM public.student_risk_snapshots WHERE student_id = v_student_id;

  -- First insert
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today, 85.0, 'HIGH',
    '[{"factor":"slope","value":-5}]'::jsonb, 'Remedial', v_subject_id, 'HASH_ACAD1'
  ) RETURNING id INTO v_snap_id_1;

  -- Second insert with same key (should violate)
  BEGIN
    INSERT INTO public.student_risk_snapshots (
      school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
    ) VALUES (
      v_school_id, v_student_id, 'academic', v_today, 87.0, 'HIGH',
      '[{"factor":"slope","value":-6}]'::jsonb, 'Remedial 2', v_subject_id, 'HASH_ACAD2'
    );

    RAISE EXCEPTION 'FAIL 12.3: Duplicate academic snapshot insert succeeded without ON CONFLICT';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 12.3: Academic snapshot unique constraint enforced (unique_violation caught)';
  END;

  -- Verify idempotent upsert works with subject_id
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today, 89.0, 'HIGH',
    '[{"factor":"slope","value":-7}]'::jsonb, 'Remedial 3', v_subject_id, 'HASH_ACAD3'
  )
  ON CONFLICT (school_id, student_id, kind, computed_for, subject_id)
    WHERE subject_id IS NOT NULL
  DO UPDATE SET
    score = EXCLUDED.score,
    band = EXCLUDED.band,
    factors = EXCLUDED.factors,
    recommended_action = EXCLUDED.recommended_action,
    params_hash = EXCLUDED.params_hash
  RETURNING id INTO v_snap_id_2;

  IF v_snap_id_1 <> v_snap_id_2 THEN
    RAISE EXCEPTION 'FAIL 12.4: Academic ON CONFLICT created new row (% vs %)', v_snap_id_1, v_snap_id_2;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.student_risk_snapshots
  WHERE school_id = v_school_id AND student_id = v_student_id
    AND kind = 'academic' AND computed_for = v_today AND subject_id = v_subject_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 12.4: Expected 1 academic snapshot, found %', v_count;
  END IF;

  RAISE NOTICE 'PASS 12.4: Academic snapshot ON CONFLICT upsert creates exactly 1 row';

END $$;

ROLLBACK;
