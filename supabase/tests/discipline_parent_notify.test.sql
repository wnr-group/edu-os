-- Regression test for EDUOS-2026-08-18-16: Teacher Complaints -> Parent
-- Visibility. Confirms the full pipeline: teacher creates a discipline
-- record -> parent_notified is set -> a notifications row is created for
-- the correct parent -> the parent can retrieve it via the exact query
-- shape apps/mobile/app/(parent)/more.tsx already uses. Also confirms the
-- trigger degrades safely (no error, no orphaned notification) for a
-- student with no linked parent.
-- Uses local seed's Demo School / student dddddddd-...0001 (Aryan Sharma,
-- parent aaaaaaaa-...0030) / class teacher aaaaaaaa-...0013.
-- Run: npx supabase db query --local -f supabase/tests/discipline_parent_notify.test.sql

BEGIN;

-- ── Case 1: student with a linked parent ──────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE
  v_notified boolean;
BEGIN
  INSERT INTO public.discipline_records (school_id, student_id, category, severity, description, recorded_by)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'behavioral', 'written', 'Regression test complaint', 'aaaaaaaa-0000-0000-0000-000000000013')
  RETURNING parent_notified INTO v_notified;

  IF NOT v_notified THEN
    RAISE EXCEPTION 'FAIL: parent_notified was not set to true for a student with a linked parent';
  END IF;
  RAISE NOTICE 'PASS: parent_notified set to true on discipline_records insert';
END $$;

-- Verify the notification row truly exists (as superuser, bypassing RLS,
-- since the teacher's own session correctly cannot read another user's row).
RESET ROLE;
DO $$
DECLARE v_notif_count int;
BEGIN
  SELECT count(*) INTO v_notif_count
  FROM public.notifications
  WHERE student_id = 'dddddddd-0000-0000-0000-000000000001'
    AND type = 'discipline_record'
    AND user_id = 'aaaaaaaa-0000-0000-0000-000000000030';

  IF v_notif_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 discipline_record notification for the correct parent, got %', v_notif_count;
  END IF;
  RAISE NOTICE 'PASS: exactly 1 notification row created for the correct parent';
END $$;

-- Parent retrieves it via the exact query shape more.tsx's loadNotifications() uses.
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000030'
      AND type = 'discipline_record'
      AND title = 'Discipline record added'
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'FAIL: parent could not retrieve the discipline_record notification via their own RLS-scoped query';
  END IF;
  RAISE NOTICE 'PASS: parent retrieves the notification via their own RLS-scoped session';
END $$;

-- ── Case 2: student with NO linked parent -> no error, no orphaned notification ──
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

DO $$
DECLARE
  v_notified boolean;
BEGIN
  INSERT INTO public.discipline_records (school_id, student_id, category, severity, description, recorded_by)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'fec9c308-c8d2-4630-81d4-7f3e6eccaaa2', 'academic', 'verbal', 'Regression test - no parent linked', 'aaaaaaaa-0000-0000-0000-000000000014')
  RETURNING parent_notified INTO v_notified;

  IF v_notified THEN
    RAISE EXCEPTION 'FAIL: parent_notified was set true for a student with no linked parent';
  END IF;
END $$;

RESET ROLE;
DO $$
DECLARE v_notif_count int;
BEGIN
  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE student_id = 'fec9c308-c8d2-4630-81d4-7f3e6eccaaa2';
  IF v_notif_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: an orphaned notification was created for a student with no linked parent';
  END IF;
  RAISE NOTICE 'PASS: discipline_records insert succeeds cleanly for a student with no linked parent, no orphaned notification';
END $$;

ROLLBACK;
