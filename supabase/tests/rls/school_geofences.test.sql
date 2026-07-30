-- RLS isolation test for school_geofences: same-school read for any role,
-- write locked to school_admin + super_admin (anti-spoof — a teacher or
-- principal must never be able to draw their own geofence).
-- Run: npx supabase db query --local -f supabase/tests/rls/school_geofences.test.sql

BEGIN;

INSERT INTO public.schools (id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.school_geofences (id, school_id, name, center_lat, center_lng, radius_m, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001', 'Main Campus', 0, 0, 100, 'a0000000-0000-0000-0000-00000000001f');

-- ── teacher: can read, cannot write ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_geofences WHERE id = 'a0000000-0000-0000-0000-000000000030') THEN
    RAISE EXCEPTION 'FAIL: teacher cannot read school_geofences in their own school';
  END IF;
  RAISE NOTICE 'PASS: teacher can read school_geofences in their own school';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_geofences (school_id, name, center_lat, center_lng, radius_m) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'Spoofed Fence', 12.9, 77.6, 50);
    RAISE EXCEPTION 'FAIL: teacher was able to insert a school_geofences row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: teacher insert into school_geofences rejected';
  END;
END $$;

-- ── principal: can read, cannot write (read-only per Module A.5) ─────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_geofences (school_id, name, center_lat, center_lng, radius_m) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'Principal Fence', 12.9, 77.6, 50);
    RAISE EXCEPTION 'FAIL: principal was able to insert a school_geofences row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: principal insert into school_geofences rejected (read-only)';
  END;
END $$;

-- ── school_admin: can read and write ─────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

INSERT INTO public.school_geofences (school_id, name, center_lat, center_lng, radius_m) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Sports Annexe', 12.91, 77.61, 80);

DO $$ BEGIN RAISE NOTICE 'PASS: school_admin insert into school_geofences accepted'; END $$;

-- ── super_admin: bypasses school scoping on read ─────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_geofences WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see school_geofences across schools';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses school scoping on school_geofences';
END $$;

RESET ROLE;
ROLLBACK;
