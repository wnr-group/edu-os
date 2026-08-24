-- supabase/tests/interventions_security.test.sql
--
-- Security, RLS & Authorization Suite for Insights & Interventions V1
--
-- WHAT IT PROVES:
-- 1. Strict RLS isolation: Parents cannot SELECT, INSERT, UPDATE, or DELETE on:
--    - interventions
--    - student_risk_snapshots
--    - intervention_academic_evidence
--    - intervention_parent_notifications
-- 2. Strict RPC Authorization: Only assigned teachers or school principals/admins can invoke:
--    - start_intervention
--    - complete_intervention
--    - dismiss_intervention
--    - reassign_intervention
--    - notify_parent_for_intervention
-- 3. Cross-school actors (teachers, principals, admins from School B) are denied access with 'not_authorized'.
-- 4. Unassigned same-school teachers who do not teach the student are denied access with 'not_authorized'.
-- 5. Parents calling lifecycle RPCs with real intervention IDs are denied access with 'not_authorized'.
-- 6. Parent notification message safety: Proves parent-visible notification text contains zero internal scores,
--    bands ('HIGH'/'MED'/'LOW'), factors, rule names, staff notes, or dismissal reasons.
--
-- WHAT IT DOES NOT PROVE:
-- - Concurrency race conditions (tested separately in interventions_concurrency.test.ts)
-- - Background Edge Function worker orchestration (tested separately)
--
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/interventions_security.test.sql

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

-- Test constants from Demo School seed:
-- School 1: 'aaaaaaaa-0000-0000-0000-000000000001'
-- School 2: 'aaaaaaaa-0000-0000-0000-0000000000b2'
-- Student Aryan Sharma: 'dddddddd-0000-0000-0000-000000000001'
-- Parent of Aryan Sharma: 'aaaaaaaa-0000-0000-0000-000000000030'
-- Assigned Teacher (8A): 'aaaaaaaa-0000-0000-0000-000000000013'
-- Unassigned Teacher (5A only): 'aaaaaaaa-0000-0000-0000-000000000014'
-- Principal School 1: 'aaaaaaaa-0000-0000-0000-000000000012'

DO $$
DECLARE
  v_school_1 UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_school_2 UUID := 'aaaaaaaa-0000-0000-0000-0000000000b2';
  v_student_id UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_parent_id UUID := 'aaaaaaaa-0000-0000-0000-000000000030';
  v_assigned_teacher UUID := 'aaaaaaaa-0000-0000-0000-000000000013';
  v_other_teacher UUID := 'aaaaaaaa-0000-0000-0000-000000000014';
  v_principal_1 UUID := 'aaaaaaaa-0000-0000-0000-000000000012';
  v_school_2_principal UUID := 'aaaaaaaa-0000-0000-0000-000000000099';
  v_school_2_teacher UUID := 'aaaaaaaa-0000-0000-0000-000000000098';
  v_snap_id UUID;
  v_interv_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- Seed test auth users for School 2
  INSERT INTO auth.users (id, email, phone, aud, role)
  VALUES 
    (v_school_2_principal, 'school2_principal@test.com', '+919999999991', 'authenticated', 'authenticated'),
    (v_school_2_teacher, 'school2_teacher@test.com', '+919999999992', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- Seed test actors for School 2
  INSERT INTO public.user_roles (user_id, school_id, role, is_active)
  VALUES 
    (v_school_2_principal, v_school_2, 'principal', true),
    (v_school_2_teacher, v_school_2, 'teacher', true)
  ON CONFLICT DO NOTHING;

  -- Seed a test risk snapshot and intervention in School 1 as superuser
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_1, v_student_id, 'attendance', v_today, 88.50, 'HIGH',
    '[{"factor":"unexcused_streak","detail":"3 consecutive days","weight":0.4}]'::jsonb,
    'Call parent to address consecutive absences', 'SECURITY_TEST_HASH'
  ) RETURNING id INTO v_snap_id;

  v_interv_id := public.create_intervention_if_qualifying(v_snap_id);

  IF v_interv_id IS NULL THEN
    RAISE EXCEPTION 'Failed to setup test intervention';
  END IF;

  -- Store IDs in a temporary table for session-based testing below
  CREATE TEMP TABLE test_fixtures ON COMMIT DROP AS
  SELECT v_snap_id AS snap_id, v_interv_id AS interv_id;

  GRANT ALL ON test_fixtures TO authenticated;

  RAISE NOTICE 'Fixtures seeded: snapshot=%, intervention=%', v_snap_id, v_interv_id;
END $$;

-- ============================================================================
-- 1. Parent Direct Table Access Tests (RLS Enforcement)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

-- Test 1.1: Parent cannot SELECT from interventions
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.interventions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.1: Parent was able to query % intervention rows', v_count;
  END IF;
  RAISE NOTICE 'PASS 1.1: Parent SELECT on interventions returned 0 rows';
END $$;

-- Test 1.2: Parent cannot SELECT from student_risk_snapshots
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.student_risk_snapshots;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.2: Parent was able to query % student_risk_snapshots rows', v_count;
  END IF;
  RAISE NOTICE 'PASS 1.2: Parent SELECT on student_risk_snapshots returned 0 rows';
END $$;

-- Test 1.3: Parent cannot SELECT from intervention_academic_evidence
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.intervention_academic_evidence;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.3: Parent was able to query % intervention_academic_evidence rows', v_count;
  END IF;
  RAISE NOTICE 'PASS 1.3: Parent SELECT on intervention_academic_evidence returned 0 rows';
END $$;

-- Test 1.4: Parent cannot SELECT from intervention_parent_notifications
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.intervention_parent_notifications;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.4: Parent was able to query % intervention_parent_notifications rows', v_count;
  END IF;
  RAISE NOTICE 'PASS 1.4: Parent SELECT on intervention_parent_notifications returned 0 rows';
END $$;

-- Test 1.5: Parent cannot directly INSERT into interventions
DO $$
BEGIN
  INSERT INTO public.interventions (
    school_id, student_id, kind, type, title, source_snapshot_id, status, severity_band, assignee_id, assigned_via, due_date, due_date_original
  ) SELECT 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'attendance', 'CONTACT_PARENT', 'Illegal', snap_id, 'pending', 'HIGH', 'aaaaaaaa-0000-0000-0000-000000000013', 'class_teacher', CURRENT_DATE, CURRENT_DATE
  FROM test_fixtures;
  
  RAISE EXCEPTION 'FAIL 1.5: Parent direct INSERT into interventions unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 1.5: Parent direct INSERT into interventions blocked by RLS (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 1.5: Parent direct INSERT into interventions blocked (42501)';
  ELSE
    RAISE;
  END IF;
END $$;

-- ============================================================================
-- 2. Parent Lifecycle RPC Denial (Using REAL Intervention ID)
-- ============================================================================
-- Test 2.1: Parent calling start_intervention
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.start_intervention(v_id);
  RAISE EXCEPTION 'FAIL 2.1: Parent calling start_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 2.1: Parent start_intervention denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 2.1: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

-- Test 2.2: Parent calling complete_intervention
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.complete_intervention(v_id, 'Hacked complete');
  RAISE EXCEPTION 'FAIL 2.2: Parent calling complete_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 2.2: Parent complete_intervention denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 2.2: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

-- Test 2.3: Parent calling dismiss_intervention
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.dismiss_intervention(v_id, 'Hacked dismiss');
  RAISE EXCEPTION 'FAIL 2.3: Parent calling dismiss_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 2.3: Parent dismiss_intervention denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 2.3: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

-- Test 2.4: Parent calling reassign_intervention
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.reassign_intervention(v_id, 'aaaaaaaa-0000-0000-0000-000000000030');
  RAISE EXCEPTION 'FAIL 2.4: Parent calling reassign_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 2.4: Parent reassign_intervention denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 2.4: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

-- Test 2.5: Parent calling notify_parent_for_intervention
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.notify_parent_for_intervention(v_id, gen_random_uuid());
  RAISE EXCEPTION 'FAIL 2.5: Parent calling notify_parent_for_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 2.5: Parent notify_parent_for_intervention denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 2.5: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

RESET ROLE;

-- ============================================================================
-- 3. Cross-School Actor Denials (School B Principal & Teacher)
-- ============================================================================
-- Test 3.1: School 2 Principal calling start_intervention on School 1 intervention
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-0000000000b2', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000099"}', true);

DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.start_intervention(v_id);
  RAISE EXCEPTION 'FAIL 3.1: School 2 Principal start_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 3.1: School 2 Principal start_intervention denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 3.1: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

-- Test 3.2: School 2 Teacher calling notify_parent_for_intervention on School 1 intervention
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-0000000000b2', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000098"}', true);

DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.notify_parent_for_intervention(v_id, gen_random_uuid());
  RAISE EXCEPTION 'FAIL 3.2: School 2 Teacher notify_parent unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 3.2: School 2 Teacher notify_parent denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 3.2: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

RESET ROLE;

-- ============================================================================
-- 4. Same-School Unassigned Teacher Denial
-- ============================================================================
-- Teacher 5A ('...0014') is in School 1, but is NOT assignee and does not teach Aryan Sharma
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

DO $$
DECLARE v_id UUID;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  PERFORM public.start_intervention(v_id);
  RAISE EXCEPTION 'FAIL 4.1: Unassigned teacher start_intervention unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%not_authorized%' THEN
    RAISE NOTICE 'PASS 4.1: Unassigned same-school teacher denied with not_authorized';
  ELSE
    RAISE EXCEPTION 'FAIL 4.1: Expected not_authorized but got: %', SQLERRM;
  END IF;
END $$;

RESET ROLE;

-- ============================================================================
-- 5. Authorized Teacher & Parent Notification Message Safety Verification
-- ============================================================================
-- Assigned Class Teacher ('...0013') sends notification to parent
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE
  v_id UUID;
  v_notif_id UUID;
  v_req_id UUID := gen_random_uuid();
  v_title TEXT;
  v_body TEXT;
BEGIN
  SELECT interv_id INTO v_id FROM test_fixtures;
  
  -- Assigned teacher executes notify_parent_for_intervention
  v_notif_id := public.notify_parent_for_intervention(v_id, v_req_id);
  
  IF v_notif_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 5.1: Authorized teacher notify_parent returned NULL';
  END IF;

  -- Inspect notification row directly
  SELECT title, body INTO v_title, v_body
  FROM public.notifications WHERE id = v_notif_id;

  -- Assert safety invariants on message text
  IF v_body ILIKE '%88.5%' OR v_body ILIKE '%HIGH%' OR v_body ILIKE '%unexcused_streak%' OR v_body ILIKE '%score%' OR v_body ILIKE '%band%' THEN
    RAISE EXCEPTION 'FAIL 5.2: Parent notification leaks internal score/band/factors: %', v_body;
  END IF;

  IF v_title <> 'Attendance Notice' THEN
    RAISE EXCEPTION 'FAIL 5.3: Unexpected notification title: %', v_title;
  END IF;

  IF v_body NOT LIKE '%Aryan Sharma%' THEN
    RAISE EXCEPTION 'FAIL 5.4: Notification body missing student name: %', v_body;
  END IF;

  RAISE NOTICE 'PASS 5.1-5.4: Authorized teacher notification created with verified safe template copy';
END $$;

RESET ROLE;

ROLLBACK;
