-- supabase/tests/feedback_thread_id_forgery.test.sql
--
-- Regression test for PR #25 review Comment #20: thread_id was written
-- entirely by the client, so a parent could submit a Message-Teacher row
-- R_t, then a second row with thread_id = R_t.id (an id they already
-- have), and get R_t's notification silently marked read/rewritten via
-- resolveFeedback's sibling sweep when responding to their own row.
--
-- Structural fix: thread_id is now assigned server-side by
-- submit_management_feedback (20260903100900), and feedback_insert's
-- WITH CHECK requires thread_id IS NULL for any ordinary client insert.
-- Proves:
--   1. A parent cannot set thread_id directly via a plain INSERT — RLS
--      rejects it, regardless of what value is chosen.
--   2. submit_management_feedback creates both rows with a real,
--      server-generated thread_id that a client never supplied.
--   3. That thread_id never equals a pre-existing, unrelated feedback
--      row's own id (the shape the exploit depended on).
--
-- Uses local seed: Demo School (aaaaaaaa-...0001), parent aaaaaaaa-...0030
-- (Sunita Sharma), her child's class teacher aaaaaaaa-...0013 (Ravi Kumar,
-- verified live against section_assignments, not assumed).
--
-- Run: npx supabase db query --local -f supabase/tests/feedback_thread_id_forgery.test.sql

BEGIN;

-- ── Case 1: a plain client INSERT can no longer set thread_id ──────────────
-- First, a real Message-Teacher row (R_t) the parent legitimately has the
-- id of, exactly as the exploit requires.
DO $$
DECLARE
  v_rt_id uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'parent', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

  INSERT INTO public.feedback (school_id, from_user_id, to_role, to_user_id, subject, message, status)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000030',
          'teacher', 'aaaaaaaa-0000-0000-0000-000000000013', 'Homework question', 'Real message to the teacher', 'open')
  RETURNING id INTO v_rt_id;

  -- The attempted forgery: a second row naming R_t's own id as thread_id.
  BEGIN
    INSERT INTO public.feedback (school_id, from_user_id, to_role, subject, message, status, thread_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000030',
            'principal', 'Fake subject', 'Fake message', 'open', v_rt_id);
    RAISE EXCEPTION 'FAIL: client-supplied thread_id was accepted';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE NOTICE 'PASS: a plain INSERT setting thread_id is rejected by RLS';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

-- ── Case 2 & 3: submit_management_feedback assigns a real, server-side thread_id ──
DO $$
DECLARE
  v_principal_id uuid;
  v_admin_id uuid;
  v_thread_principal uuid;
  v_thread_admin uuid;
  v_rt_id uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'parent', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

  SELECT id INTO v_rt_id FROM public.feedback
  WHERE from_user_id = 'aaaaaaaa-0000-0000-0000-000000000030' AND to_role = 'teacher'
  ORDER BY created_at DESC LIMIT 1;

  SELECT principal_feedback_id, school_admin_feedback_id
    INTO v_principal_id, v_admin_id
  FROM public.submit_management_feedback('Fee question', 'Can I get a receipt for last month''s payment?');

  IF v_principal_id IS NULL OR v_admin_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: submit_management_feedback did not return both row ids';
  END IF;
  RAISE NOTICE 'PASS: submit_management_feedback created both rows';

  SELECT thread_id INTO v_thread_principal FROM public.feedback WHERE id = v_principal_id;
  SELECT thread_id INTO v_thread_admin FROM public.feedback WHERE id = v_admin_id;

  IF v_thread_principal IS NULL OR v_thread_admin IS NULL OR v_thread_principal <> v_thread_admin THEN
    RAISE EXCEPTION 'FAIL: the two rows do not share a real, non-null thread_id';
  END IF;
  RAISE NOTICE 'PASS: both rows share one server-generated thread_id';

  IF v_thread_principal = v_rt_id THEN
    RAISE EXCEPTION 'FAIL: the generated thread_id collided with the unrelated Message-Teacher row (this should be astronomically unlikely, not just unlucky)';
  END IF;
  RAISE NOTICE 'PASS: the generated thread_id is unrelated to the pre-existing Message-Teacher row';
END $$;
RESET ROLE;

ROLLBACK;
