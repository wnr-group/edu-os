-- supabase/tests/notifications_fee_reminder_visibility.test.sql
--
-- Regression test for PR #25 review Comment 3: 20260824130000 correctly
-- closed a cross-school notifications leak (main's old policy let any
-- school_admin read every school's notifications) by scoping
-- notifications_select to `user_id = auth.uid()` only — but that also
-- broke the admin Fee Status page, which reads other users' (parents')
-- fee_reminder notifications to compute reminder stats. This proves the
-- narrow fee_reminder exception restores that one specific read without
-- reopening the general leak:
--   1. same-school school_admin CAN see a fee_reminder row addressed to a
--      parent.
--   2. same-school school_admin CANNOT see a non-fee_reminder row addressed
--      to someone else (personal isolation still holds).
--   3. a DIFFERENT school's admin CANNOT see the fee_reminder row either
--      (cross-school protection still holds).
--   4. the parent can still see their own row of either type (unchanged
--      user_id = auth.uid() branch).
--
-- Also covers review Comment 15 (2026-08-29 follow-up): main's original
-- policy included super_admin, which the first fee_reminder exception
-- silently dropped, and the reviewer's own suggested addition of principal
-- turned out to be unintended widening (no principal-facing fee page
-- consumes this read) — so this now also proves:
--   5. super_admin CAN see the fee_reminder row (restored).
--   6. principal CANNOT see the fee_reminder row (deliberately not
--      included — fee reminders are parent-only; only school_admin's Fee
--      Status page and super_admin need this exception).
--
-- Run: npx supabase db query --local -f supabase/tests/notifications_fee_reminder_visibility.test.sql

BEGIN;

INSERT INTO public.notifications (id, school_id, user_id, title, body, type)
VALUES
  ('eeeeeeee-dddd-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'Fee reminder', 'Your fee is due.', 'fee_reminder'),
  ('eeeeeeee-dddd-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'Personal note', 'Something personal.', 'general');

-- ── Case 1 & 2: same-school school_admin sees fee_reminder, not general ────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications WHERE id = 'eeeeeeee-dddd-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: same-school admin could not see the fee_reminder notification, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: same-school admin sees the fee_reminder notification';

  SELECT count(*) INTO v_count FROM public.notifications WHERE id = 'eeeeeeee-dddd-0000-0000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: same-school admin could see a non-fee_reminder notification addressed to someone else, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: same-school admin cannot see an unrelated personal notification (isolation intact)';
END $$;
RESET ROLE;

-- ── Case 3: a DIFFERENT school's admin cannot see the fee_reminder row ─────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-0000000000b2', true); -- Demo School Two
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000099"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications WHERE id = 'eeeeeeee-dddd-0000-0000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cross-school admin could see another school''s fee_reminder notification, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: cross-school admin cannot see the fee_reminder notification (cross-school protection intact)';
END $$;
RESET ROLE;

-- ── Case 5: super_admin CAN see the fee_reminder row (restored) ────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000010"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications WHERE id = 'eeeeeeee-dddd-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: super_admin could not see the fee_reminder notification, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: super_admin sees the fee_reminder notification';
END $$;
RESET ROLE;

-- ── Case 6: principal CANNOT see the fee_reminder row (parents-only) ───────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000012"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications WHERE id = 'eeeeeeee-dddd-0000-0000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: principal could see the fee_reminder notification, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: principal cannot see the fee_reminder notification (parents-only, no principal fee page needs it)';
END $$;
RESET ROLE;

-- ── Case 4: the parent can still see their own rows of either type ─────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications
  WHERE id IN ('eeeeeeee-dddd-0000-0000-000000000001', 'eeeeeeee-dddd-0000-0000-000000000002');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: parent could not see their own notifications, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: parent still sees their own notifications regardless of type';
END $$;
RESET ROLE;

ROLLBACK;
