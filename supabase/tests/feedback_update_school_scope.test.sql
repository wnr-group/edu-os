-- supabase/tests/feedback_update_school_scope.test.sql
--
-- Regression test for PR #25 review (Comment #20's "issue #30", verified
-- independently): feedback_update had no school_id condition and no
-- WITH CHECK at all, unlike feedback_select in the same file. Fixed in
-- 20260903101000 (new migration — 20260728123200 is already on main and
-- was not edited). Proves:
--   1. The legitimate flow still works: the addressed teacher can respond
--      to their own row, setting responded_by to themselves.
--   2. A staff member from a DIFFERENT school cannot UPDATE this school's
--      feedback row at all (USING now requires same school).
--   3. Same-school staff cannot forge responded_by to name a different
--      user as the responder (WITH CHECK).
--
-- Uses local seed: Demo School (aaaaaaaa-...0001), teacher aaaaaaaa-...0013
-- (Ravi Kumar), school_admin aaaaaaaa-...0011 (Arjun Sharma). Demo School
-- Two (aaaaaaaa-...0000000000b2) for the cross-school case, via a
-- temporary role grant on a real existing identity (...0014, Priya Nair) —
-- not a spoofed/nonexistent user.
--
-- Run: npx supabase db query --local -f supabase/tests/feedback_update_school_scope.test.sql

BEGIN;

INSERT INTO public.feedback (id, school_id, from_user_id, to_role, to_user_id, subject, message, status)
VALUES ('eeeeeeee-f000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000030', 'teacher', 'aaaaaaaa-0000-0000-0000-000000000013',
        'Homework question', 'Real message to the teacher', 'open');

-- ── Case 1: the addressed teacher can still respond (legitimate flow) ──────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'teacher', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

  UPDATE public.feedback
  SET status = 'responded', response = 'Sure, here is the answer.', responded_by = 'aaaaaaaa-0000-0000-0000-000000000013'
  WHERE id = 'eeeeeeee-f000-0000-0000-000000000001';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: the addressed same-school teacher could not respond to their own row';
  END IF;
  RAISE NOTICE 'PASS: same-school teacher can respond to their own row, setting responded_by to themselves';
END $$;
RESET ROLE;

-- Reset the fixture row back to pending for the next cases.
UPDATE public.feedback SET status = 'open', response = NULL, responded_by = NULL
WHERE id = 'eeeeeeee-f000-0000-0000-000000000001';

-- ── Case 2: a DIFFERENT school's staff cannot update this row at all ───────
-- Real identity (Priya Nair, already exists in auth.users), temporarily
-- granted a role under Demo School Two — not a spoofed/nonexistent user.
INSERT INTO public.user_roles (user_id, school_id, role, is_active)
VALUES ('aaaaaaaa-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'school_admin', true);

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'school_admin', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-0000000000b2', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

  UPDATE public.feedback
  SET status = 'responded', response = 'Cross-school forgery attempt', responded_by = 'aaaaaaaa-0000-0000-0000-000000000014'
  WHERE id = 'eeeeeeee-f000-0000-0000-000000000001';

  IF FOUND THEN
    RAISE EXCEPTION 'FAIL: a different school''s staff member updated this row';
  END IF;
  RAISE NOTICE 'PASS: cross-school staff cannot update this row (0 rows matched)';
END $$;
RESET ROLE;

-- ── Case 3: same-school staff cannot forge responded_by to someone else ────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'teacher', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

  BEGIN
    UPDATE public.feedback
    SET status = 'responded', response = 'Forged responder', responded_by = 'aaaaaaaa-0000-0000-0000-000000000011'
    WHERE id = 'eeeeeeee-f000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL: responded_by was forged to a different user';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE NOTICE 'PASS: same-school staff cannot set responded_by to a different user (WITH CHECK)';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

ROLLBACK;
