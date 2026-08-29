-- supabase/tests/ptm_anon_execute_denial.test.sql
--
-- Regression test for PR #24 review Comment 5: Postgres grants EXECUTE to
-- PUBLIC by default on every new function, and PostgREST publishes every
-- function in the public schema as a live API endpoint regardless of naming
-- or intent — so every PTM RPC needed an explicit
-- REVOKE ... FROM PUBLIC, anon alongside its GRANT ... TO authenticated.
-- Proves all 13 PTM functions reject the anon role outright. Argument
-- values are dummies — EXECUTE privilege is checked before the function
-- body ever runs, so this is a pure privilege check, not a validity check.
--
-- Run: npx supabase db query --local -f supabase/tests/ptm_anon_execute_denial.test.sql

BEGIN;

SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.schedule_ptm_meeting(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), CURRENT_DATE + 1, '10:00'::time);
    RAISE EXCEPTION 'FAIL: anon executed schedule_ptm_meeting';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on schedule_ptm_meeting';
  END;

  BEGIN
    PERFORM public.reschedule_ptm_meeting(gen_random_uuid(), CURRENT_DATE + 1, '10:00'::time, NULL);
    RAISE EXCEPTION 'FAIL: anon executed reschedule_ptm_meeting';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on reschedule_ptm_meeting';
  END;

  BEGIN
    PERFORM public.cancel_ptm_meeting(gen_random_uuid(), NULL);
    RAISE EXCEPTION 'FAIL: anon executed cancel_ptm_meeting';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on cancel_ptm_meeting';
  END;

  BEGIN
    PERFORM public.mark_ptm_completed(gen_random_uuid(), 'completed'::public.ptm_meeting_status);
    RAISE EXCEPTION 'FAIL: anon executed mark_ptm_completed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on mark_ptm_completed';
  END;

  BEGIN
    PERFORM public.record_ptm_feedback(gen_random_uuid(), 'x', true, NULL, NULL, NULL, false);
    RAISE EXCEPTION 'FAIL: anon executed record_ptm_feedback';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on record_ptm_feedback';
  END;

  BEGIN
    PERFORM public.get_ptm_feedback_for_parent(gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed get_ptm_feedback_for_parent';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on get_ptm_feedback_for_parent';
  END;

  BEGIN
    PERFORM public.bulk_schedule_ptm_meetings(gen_random_uuid(), CURRENT_DATE + 1, '10:00'::time, 15::smallint, gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed bulk_schedule_ptm_meetings';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on bulk_schedule_ptm_meetings';
  END;

  BEGIN
    PERFORM public.publish_ptm_slot(gen_random_uuid(), CURRENT_DATE + 1, '10:00'::time, 15::smallint, gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed publish_ptm_slot';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on publish_ptm_slot';
  END;

  BEGIN
    PERFORM public.withdraw_ptm_slot(gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed withdraw_ptm_slot';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on withdraw_ptm_slot';
  END;

  BEGIN
    PERFORM public.book_ptm_slot(gen_random_uuid(), gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed book_ptm_slot';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on book_ptm_slot';
  END;

  BEGIN
    PERFORM public.acknowledge_ptm_booking(gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed acknowledge_ptm_booking';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on acknowledge_ptm_booking';
  END;

  BEGIN
    PERFORM public.bulk_cancel_ptm_meetings(ARRAY[gen_random_uuid()], NULL);
    RAISE EXCEPTION 'FAIL: anon executed bulk_cancel_ptm_meetings';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on bulk_cancel_ptm_meetings';
  END;

  BEGIN
    PERFORM public.bulk_publish_ptm_slots(gen_random_uuid(), CURRENT_DATE + 1, ARRAY['10:00'::time], 15::smallint, gen_random_uuid());
    RAISE EXCEPTION 'FAIL: anon executed bulk_publish_ptm_slots';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon has no EXECUTE on bulk_publish_ptm_slots';
  END;
END $$;

RESET ROLE;
ROLLBACK;
