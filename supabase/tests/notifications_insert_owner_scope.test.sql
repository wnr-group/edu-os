-- supabase/tests/notifications_insert_owner_scope.test.sql
--
-- Regression test for PR #25 review (Comment #20's "issue #30", verified
-- independently): notifications_insert only checked school_id, with no
-- user_id constraint at all — any authenticated user could INSERT a
-- notification for any other user in their school. Fixed in
-- 20260903101100 (new migration — 20240001000010 is already on main and
-- was not edited). Every legitimate producer (feedback-notify,
-- kyc-document-notify, leave-notify, send-fee-reminder, ...) writes
-- through a service-role client and is unaffected by this policy. Proves:
--   1. A user can insert a notification for themselves.
--   2. A user cannot insert a notification naming a different user_id.
--
-- Uses local seed: Demo School (aaaaaaaa-...0001), parent aaaaaaaa-...0030,
-- school_admin aaaaaaaa-...0011.
--
-- Run: npx supabase db query --local -f supabase/tests/notifications_insert_owner_scope.test.sql

BEGIN;

-- ── Case 1: a user can insert a notification for themselves ────────────────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'parent', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

  INSERT INTO public.notifications (school_id, user_id, title, body, type)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000030', 'Self', 'Own notification', 'general');
  RAISE NOTICE 'PASS: a user can insert a notification addressed to themselves';
END $$;
RESET ROLE;

-- ── Case 2: a user cannot insert a notification for someone else ───────────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('app.role', 'parent', true);
  PERFORM set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

  BEGIN
    INSERT INTO public.notifications (school_id, user_id, title, body, type)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000011', 'Forged', 'Not really from the admin', 'leave_requested');
    RAISE EXCEPTION 'FAIL: inserted a notification for a different user_id';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE NOTICE 'PASS: a user cannot insert a notification naming a different user_id';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

ROLLBACK;
