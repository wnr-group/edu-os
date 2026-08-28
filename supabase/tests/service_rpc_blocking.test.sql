-- Test Finding #3 & #4: Verify anon and authenticated cannot call service-role-only RPCs
--
-- SERVICE-ROLE-ONLY RPCs (per migration 20260824154000):
-- - insights_recompute_dispatch()
-- - claim_insight_run_chunk(...)
-- - heartbeat_insight_run(...)
-- - increment_insight_run_counter(...)
-- - create_intervention_if_qualifying(...)
-- - notify_parent_for_intervention(...) -- WAIT, this is authenticated-allowed per the migration!
--
-- Expected: All calls as anon or authenticated should fail with permission denied

BEGIN;

-- ============================================================================
-- Finding #3: Test anon role CANNOT execute service-role-only RPCs
-- ============================================================================

SET ROLE anon;

-- Test 3.1: anon calling insights_recompute_dispatch
DO $$
BEGIN
  PERFORM public.insights_recompute_dispatch();
  RAISE EXCEPTION 'FAIL 3.1: anon was able to call insights_recompute_dispatch';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 3.1: anon blocked from insights_recompute_dispatch (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 3.1: anon blocked from insights_recompute_dispatch (42501 permission denied)';
  ELSE
    RAISE EXCEPTION 'FAIL 3.1: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 3.2: anon calling claim_insight_run_chunk
DO $$
BEGIN
  PERFORM public.claim_insight_run_chunk(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    CURRENT_DATE,
    0,
    100,
    gen_random_uuid(),
    300
  );
  RAISE EXCEPTION 'FAIL 3.2: anon was able to call claim_insight_run_chunk';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 3.2: anon blocked from claim_insight_run_chunk (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 3.2: anon blocked from claim_insight_run_chunk (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 3.2: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 3.3: anon calling heartbeat_insight_run
DO $$
BEGIN
  PERFORM public.heartbeat_insight_run(gen_random_uuid(), gen_random_uuid(), 60);
  RAISE EXCEPTION 'FAIL 3.3: anon was able to call heartbeat_insight_run';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 3.3: anon blocked from heartbeat_insight_run (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 3.3: anon blocked from heartbeat_insight_run (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 3.3: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 3.4: anon calling increment_insight_run_counter
DO $$
BEGIN
  PERFORM public.increment_insight_run_counter(gen_random_uuid(), 'students_processed');
  RAISE EXCEPTION 'FAIL 3.4: anon was able to call increment_insight_run_counter';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 3.4: anon blocked from increment_insight_run_counter (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 3.4: anon blocked from increment_insight_run_counter (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 3.4: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 3.5: anon calling create_intervention_if_qualifying
DO $$
BEGIN
  PERFORM public.create_intervention_if_qualifying(gen_random_uuid());
  RAISE EXCEPTION 'FAIL 3.5: anon was able to call create_intervention_if_qualifying';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 3.5: anon blocked from create_intervention_if_qualifying (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 3.5: anon blocked from create_intervention_if_qualifying (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 3.5: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

RESET ROLE;

-- ============================================================================
-- Finding #4: Test authenticated role CANNOT execute service-role-only RPCs
-- ============================================================================

SET ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

-- Test 4.1: authenticated calling insights_recompute_dispatch
DO $$
BEGIN
  PERFORM public.insights_recompute_dispatch();
  RAISE EXCEPTION 'FAIL 4.1: authenticated was able to call insights_recompute_dispatch';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 4.1: authenticated blocked from insights_recompute_dispatch (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 4.1: authenticated blocked from insights_recompute_dispatch (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 4.1: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 4.2: authenticated calling claim_insight_run_chunk
DO $$
BEGIN
  PERFORM public.claim_insight_run_chunk(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    CURRENT_DATE,
    0,
    100,
    gen_random_uuid(),
    300
  );
  RAISE EXCEPTION 'FAIL 4.2: authenticated was able to call claim_insight_run_chunk';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 4.2: authenticated blocked from claim_insight_run_chunk (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 4.2: authenticated blocked from claim_insight_run_chunk (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 4.2: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 4.3: authenticated calling heartbeat_insight_run
DO $$
BEGIN
  PERFORM public.heartbeat_insight_run(gen_random_uuid(), gen_random_uuid(), 60);
  RAISE EXCEPTION 'FAIL 4.3: authenticated was able to call heartbeat_insight_run';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 4.3: authenticated blocked from heartbeat_insight_run (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 4.3: authenticated blocked from heartbeat_insight_run (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 4.3: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 4.4: authenticated calling increment_insight_run_counter
DO $$
BEGIN
  PERFORM public.increment_insight_run_counter(gen_random_uuid(), 'students_processed');
  RAISE EXCEPTION 'FAIL 4.4: authenticated was able to call increment_insight_run_counter';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 4.4: authenticated blocked from increment_insight_run_counter (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 4.4: authenticated blocked from increment_insight_run_counter (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 4.4: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

-- Test 4.5: authenticated calling create_intervention_if_qualifying
DO $$
BEGIN
  PERFORM public.create_intervention_if_qualifying(gen_random_uuid());
  RAISE EXCEPTION 'FAIL 4.5: authenticated was able to call create_intervention_if_qualifying';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS 4.5: authenticated blocked from create_intervention_if_qualifying (insufficient_privilege)';
WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'PASS 4.5: authenticated blocked from create_intervention_if_qualifying (42501)';
  ELSE
    RAISE EXCEPTION 'FAIL 4.5: Unexpected error: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;

RESET ROLE;

ROLLBACK;
