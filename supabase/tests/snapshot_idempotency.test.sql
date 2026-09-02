-- Test Finding #2: Snapshot Idempotency
--
-- Verifies that duplicate recomputation (same school/student/kind/date/subject) creates
-- only ONE snapshot using NULLS NOT DISTINCT unique index and 5-column ON CONFLICT.
--
-- This test uses the same onConflict shape as the production Edge Function:
--   onConflict: "school_id,student_id,kind,computed_for,subject_id"
-- which is compatible with the NULLS NOT DISTINCT unique index created in
-- migration 20260902000001_fix_snapshot_nulls_not_distinct.sql.
--
-- Tests:
--   1. Attendance snapshot (NULL subject_id) is idempotent
--   2. Academic snapshot (non-NULL subject_id) is idempotent
--   3. NULL subject_id treated as equal for uniqueness (NULLS NOT DISTINCT)
--   4. Different subject_ids remain distinct
--   5. Different dates remain distinct
--   6. Different students remain distinct
--   7. Different schools remain isolated

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

DO $$
DECLARE
  v_school_id  UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_school_2   UUID := 'aaaaaaaa-0000-0000-0000-0000000000b2';
  v_student_1  UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_student_2  UUID := 'dddddddd-0000-0000-0000-000000000002';
  v_subject_a  UUID;
  v_subject_b  UUID;
  v_today      DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_yesterday  DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
  v_snap_id_1  UUID;
  v_snap_id_2  UUID;
  v_count      INT;
BEGIN
  -- Get two subjects for academic tests
  SELECT id INTO v_subject_a FROM public.subjects
  WHERE school_id = v_school_id LIMIT 1 OFFSET 0;

  SELECT id INTO v_subject_b FROM public.subjects
  WHERE school_id = v_school_id LIMIT 1 OFFSET 1;

  IF v_subject_a IS NULL THEN
    RAISE EXCEPTION 'SETUP FAIL: No subjects found for school %', v_school_id;
  END IF;

  -- Ensure school 2 exists for isolation test
  INSERT INTO public.schools (id, name, features_enabled)
  VALUES (v_school_2, 'Test School Idempotency', '{"insights": true}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Ensure student_2 profile exists for distinct-student test
  INSERT INTO public.student_profiles (id, school_id, full_name)
  VALUES (v_student_2, v_school_id, 'Test Student 2')
  ON CONFLICT (id) DO NOTHING;

  -- Clean up test data
  DELETE FROM public.interventions WHERE student_id IN (v_student_1, v_student_2);
  DELETE FROM public.student_risk_snapshots
  WHERE student_id IN (v_student_1, v_student_2)
    OR school_id = v_school_2;

  -- ==========================================================================
  -- Test 1: Attendance snapshot idempotency (NULL subject_id)
  -- Verifies NULLS NOT DISTINCT treats two NULL subject_ids as conflicting
  -- ==========================================================================

  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_1, 'attendance', v_today, 88.0, 'HIGH',
    '[{"key":"streak","label":"3 days","value":3,"contribution":60}]'::jsonb,
    'Call parent', NULL, 'HASH1'
  ) RETURNING id INTO v_snap_id_1;

  -- Duplicate plain INSERT must fail with unique_violation
  BEGIN
    INSERT INTO public.student_risk_snapshots (
      school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
    ) VALUES (
      v_school_id, v_student_1, 'attendance', v_today, 90.0, 'HIGH',
      '[{"key":"streak","label":"4 days","value":4,"contribution":60}]'::jsonb,
      'Call parent 2', NULL, 'HASH2'
    );
    RAISE EXCEPTION 'FAIL 1a: Duplicate attendance snapshot insert succeeded — uniqueness not enforced';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 1a: Duplicate attendance snapshot raises unique_violation';
  END;

  -- 5-column ON CONFLICT upsert must update in place (same id returned)
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_1, 'attendance', v_today, 92.0, 'HIGH',
    '[{"key":"streak","label":"5 days","value":5,"contribution":60}]'::jsonb,
    'Call parent 3', NULL, 'HASH3'
  )
  ON CONFLICT (school_id, student_id, kind, computed_for, subject_id)
  DO UPDATE SET
    score             = EXCLUDED.score,
    band              = EXCLUDED.band,
    factors           = EXCLUDED.factors,
    recommended_action = EXCLUDED.recommended_action,
    params_hash       = EXCLUDED.params_hash
  RETURNING id INTO v_snap_id_2;

  IF v_snap_id_1 <> v_snap_id_2 THEN
    RAISE EXCEPTION 'FAIL 1b: 5-column ON CONFLICT created new row instead of updating (% vs %)', v_snap_id_1, v_snap_id_2;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
  WHERE school_id = v_school_id AND student_id = v_student_1
    AND kind = 'attendance' AND computed_for = v_today;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 1c: Expected 1 attendance snapshot after upsert, found %', v_count;
  END IF;

  RAISE NOTICE 'PASS 1: Attendance snapshot idempotency verified (NULL subject_id, NULLS NOT DISTINCT)';

  -- ==========================================================================
  -- Test 2: Academic snapshot idempotency (non-NULL subject_id)
  -- ==========================================================================

  DELETE FROM public.student_risk_snapshots WHERE student_id = v_student_1 AND kind = 'academic';

  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_1, 'academic', v_today, 85.0, 'HIGH',
    '[{"key":"slope","label":"Trend: -9","value":-9,"contribution":30}]'::jsonb,
    'Remedial', v_subject_a, 'HASH_ACAD1'
  ) RETURNING id INTO v_snap_id_1;

  -- Duplicate plain INSERT must fail
  BEGIN
    INSERT INTO public.student_risk_snapshots (
      school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
    ) VALUES (
      v_school_id, v_student_1, 'academic', v_today, 87.0, 'HIGH',
      '[{"key":"slope","label":"Trend: -9","value":-9,"contribution":30}]'::jsonb,
      'Remedial 2', v_subject_a, 'HASH_ACAD2'
    );
    RAISE EXCEPTION 'FAIL 2a: Duplicate academic snapshot insert succeeded — uniqueness not enforced';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 2a: Duplicate academic snapshot raises unique_violation';
  END;

  -- 5-column ON CONFLICT upsert must update in place
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_1, 'academic', v_today, 89.0, 'HIGH',
    '[{"key":"slope","label":"Trend: -9","value":-9,"contribution":30}]'::jsonb,
    'Remedial 3', v_subject_a, 'HASH_ACAD3'
  )
  ON CONFLICT (school_id, student_id, kind, computed_for, subject_id)
  DO UPDATE SET
    score             = EXCLUDED.score,
    band              = EXCLUDED.band,
    factors           = EXCLUDED.factors,
    recommended_action = EXCLUDED.recommended_action,
    params_hash       = EXCLUDED.params_hash
  RETURNING id INTO v_snap_id_2;

  IF v_snap_id_1 <> v_snap_id_2 THEN
    RAISE EXCEPTION 'FAIL 2b: Academic ON CONFLICT created new row (% vs %)', v_snap_id_1, v_snap_id_2;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
  WHERE school_id = v_school_id AND student_id = v_student_1
    AND kind = 'academic' AND computed_for = v_today AND subject_id = v_subject_a;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 2c: Expected 1 academic snapshot after upsert, found %', v_count;
  END IF;

  RAISE NOTICE 'PASS 2: Academic snapshot idempotency verified (non-NULL subject_id)';

  -- ==========================================================================
  -- Test 3: Different subject_ids remain distinct
  -- ==========================================================================

  IF v_subject_b IS NOT NULL AND v_subject_b <> v_subject_a THEN
    INSERT INTO public.student_risk_snapshots (
      school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
    ) VALUES (
      v_school_id, v_student_1, 'academic', v_today, 70.0, 'MED',
      '[{"key":"slope","label":"Trend: 0","value":0,"contribution":30}]'::jsonb,
      'Monitor', v_subject_b, 'HASH_B1'
    );

    SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
    WHERE school_id = v_school_id AND student_id = v_student_1
      AND kind = 'academic' AND computed_for = v_today;

    IF v_count <> 2 THEN
      RAISE EXCEPTION 'FAIL 3: Expected 2 academic snapshots (different subjects), found %', v_count;
    END IF;
    RAISE NOTICE 'PASS 3: Different subject_ids remain distinct (% rows)', v_count;
  ELSE
    RAISE NOTICE 'SKIP 3: Only one subject available, cannot test distinct subject_ids';
  END IF;

  -- ==========================================================================
  -- Test 4: Different dates remain distinct
  -- ==========================================================================

  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_1, 'attendance', v_yesterday, 75.0, 'MED',
    '[{"key":"rate","label":"75%","value":75,"contribution":50}]'::jsonb,
    'Monitor', NULL, 'HASH_YEST'
  );

  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
  WHERE school_id = v_school_id AND student_id = v_student_1 AND kind = 'attendance';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 4: Expected 2 attendance snapshots (different dates), found %', v_count;
  END IF;
  RAISE NOTICE 'PASS 4: Different dates remain distinct';

  -- ==========================================================================
  -- Test 5: Different students remain distinct
  -- ==========================================================================

  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_2, 'attendance', v_today, 55.0, 'MED',
    '[{"key":"rate","label":"55%","value":55,"contribution":50}]'::jsonb,
    'Check in', NULL, 'HASH_S2'
  );

  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
  WHERE school_id = v_school_id AND kind = 'attendance' AND computed_for = v_today;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'FAIL 5: Expected >= 2 attendance snapshots (different students), found %', v_count;
  END IF;
  RAISE NOTICE 'PASS 5: Different students remain distinct';

  -- ==========================================================================
  -- Test 6: Different schools remain isolated
  -- ==========================================================================

  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_2, v_student_1, 'attendance', v_today, 60.0, 'MED',
    '[{"key":"rate","label":"60%","value":60,"contribution":50}]'::jsonb,
    'Monitor', NULL, 'HASH_SCH2'
  );

  -- Must not conflict with school_1 row
  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots
  WHERE student_id = v_student_1 AND kind = 'attendance' AND computed_for = v_today;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 6: Expected 2 rows across schools, found % — schools may not be isolated', v_count;
  END IF;
  RAISE NOTICE 'PASS 6: Different schools remain isolated';

  RAISE NOTICE 'All snapshot idempotency tests passed';
END $$;

ROLLBACK;
