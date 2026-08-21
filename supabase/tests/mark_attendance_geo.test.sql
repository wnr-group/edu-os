-- Regression test for EDUOS-2026-08-18-01: mark_attendance must calculate and
-- persist geo_status / geo_distance_m / matched_geofence_id whenever
-- attendance_geo is enabled and coordinates are supplied, not just
-- captured_lat/captured_lng/gps_accuracy_m.
--
-- Run: npx supabase db query --local -f supabase/tests/mark_attendance_geo.test.sql
--
-- Uses the local seed's Demo School (aaaaaaaa-...0001), academic year
-- (aaaaaaaa-...0002), section Class1-A (cccccccc-...0101) and its enrolled
-- students. The section's seeded class teacher (aaaaaaaa-...0014, per
-- section_assignments) is used so no extra RLS-scoping fixture is needed.

BEGIN;

-- A campus geofence: 12.9716, 77.5946, 100m radius (Bengaluru).
INSERT INTO public.school_geofences (id, school_id, name, center_lat, center_lng, radius_m, created_by)
VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Main Campus',
  12.9716, 77.5946, 100,
  'aaaaaaaa-0000-0000-0000-000000000011'
);

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

-- ── Test 1: inside geofence ──────────────────────────────────────────────
SELECT public.mark_attendance(
  'cccccccc-0000-0000-0000-000000000101'::uuid,
  'FULL_DAY'::public.attendance_session,
  '2026-08-18'::date,
  '[{"student_id":"eebd9a6b-e40c-43a7-91b1-d7cec8a012a5","status":"present"}]'::jsonb,
  12.9716, 77.5946, 5, 'device'
);

DO $$
DECLARE r record;
BEGIN
  SELECT captured_lat, captured_lng, gps_accuracy_m, geo_status, geo_distance_m, matched_geofence_id
  INTO r
  FROM public.attendance_records
  WHERE student_id = 'eebd9a6b-e40c-43a7-91b1-d7cec8a012a5' AND date = '2026-08-18' AND session = 'FULL_DAY';

  IF r.captured_lat IS NULL OR r.captured_lng IS NULL OR r.gps_accuracy_m IS NULL THEN
    RAISE EXCEPTION 'FAIL: inside-geofence case did not persist captured coordinates: %', r;
  END IF;
  IF r.geo_status IS DISTINCT FROM 'inside' THEN
    RAISE EXCEPTION 'FAIL: inside-geofence case geo_status = % (expected inside)', r.geo_status;
  END IF;
  IF r.matched_geofence_id IS DISTINCT FROM 'e0000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL: inside-geofence case matched_geofence_id = % (expected the campus fence)', r.matched_geofence_id;
  END IF;
  IF r.geo_distance_m IS NULL OR r.geo_distance_m > 0 THEN
    RAISE EXCEPTION 'FAIL: inside-geofence case geo_distance_m = % (expected <= 0, i.e. within radius)', r.geo_distance_m;
  END IF;
  RAISE NOTICE 'PASS: inside geofence -> geo_status=inside, matched_geofence_id set, geo_distance_m <= 0';
END $$;

-- ── Test 2: outside geofence (~1.1km north, well past the 100m radius) ───
SELECT public.mark_attendance(
  'cccccccc-0000-0000-0000-000000000101'::uuid,
  'FULL_DAY'::public.attendance_session,
  '2026-08-18'::date,
  '[{"student_id":"6773f432-0f68-41aa-ae3c-9892fbc4d796","status":"present"}]'::jsonb,
  12.9816, 77.5946, 8, 'device'
);

DO $$
DECLARE r record;
BEGIN
  SELECT geo_status, geo_distance_m, matched_geofence_id
  INTO r
  FROM public.attendance_records
  WHERE student_id = '6773f432-0f68-41aa-ae3c-9892fbc4d796' AND date = '2026-08-18' AND session = 'FULL_DAY';

  IF r.geo_status IS DISTINCT FROM 'outside' THEN
    RAISE EXCEPTION 'FAIL: outside-geofence case geo_status = % (expected outside)', r.geo_status;
  END IF;
  IF r.geo_distance_m IS NULL OR r.geo_distance_m <= 0 THEN
    RAISE EXCEPTION 'FAIL: outside-geofence case geo_distance_m = % (expected > 0)', r.geo_distance_m;
  END IF;
  IF r.matched_geofence_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: outside-geofence case matched_geofence_id = % (expected NULL per mark_attendance business rule)', r.matched_geofence_id;
  END IF;
  RAISE NOTICE 'PASS: outside geofence -> geo_status=outside, geo_distance_m > 0, matched_geofence_id NULL';
END $$;

-- ── Test 3: no GPS on device (mobile permission denied / signal unavailable) ─
SELECT public.mark_attendance(
  'cccccccc-0000-0000-0000-000000000101'::uuid,
  'FULL_DAY'::public.attendance_session,
  '2026-08-18'::date,
  '[{"student_id":"9c1ebdb9-3526-4c89-9395-b57136fb5088","status":"present"}]'::jsonb,
  NULL, NULL, NULL, 'device'
);

DO $$
DECLARE r record;
BEGIN
  SELECT captured_lat, captured_lng, geo_status, geo_distance_m, matched_geofence_id
  INTO r
  FROM public.attendance_records
  WHERE student_id = '9c1ebdb9-3526-4c89-9395-b57136fb5088' AND date = '2026-08-18' AND session = 'FULL_DAY';

  IF r.captured_lat IS NOT NULL OR r.captured_lng IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: no-GPS case fabricated coordinates: %', r;
  END IF;
  IF r.geo_status IS DISTINCT FROM 'no_gps' THEN
    RAISE EXCEPTION 'FAIL: no-GPS case geo_status = % (expected no_gps)', r.geo_status;
  END IF;
  IF r.geo_distance_m IS NOT NULL OR r.matched_geofence_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: no-GPS case computed a distance/geofence without coordinates: %', r;
  END IF;
  RAISE NOTICE 'PASS: no GPS (device) -> geo_status=no_gps, no distance/geofence';
END $$;

-- ── Test 4: web not_captured (web never sends coordinates) ───────────────
SELECT public.mark_attendance(
  'cccccccc-0000-0000-0000-000000000101'::uuid,
  'FULL_DAY'::public.attendance_session,
  '2026-08-18'::date,
  '[{"student_id":"ebbcc218-de43-4ed1-889b-fbca0a3dddb6","status":"present"}]'::jsonb,
  NULL, NULL, NULL, 'web'
);

DO $$
DECLARE r record;
BEGIN
  SELECT geo_status, geo_distance_m, matched_geofence_id
  INTO r
  FROM public.attendance_records
  WHERE student_id = 'ebbcc218-de43-4ed1-889b-fbca0a3dddb6' AND date = '2026-08-18' AND session = 'FULL_DAY';

  IF r.geo_status IS DISTINCT FROM 'not_captured' THEN
    RAISE EXCEPTION 'FAIL: web case geo_status = % (expected not_captured)', r.geo_status;
  END IF;
  IF r.geo_distance_m IS NOT NULL OR r.matched_geofence_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: web not_captured case computed a distance/geofence: %', r;
  END IF;
  RAISE NOTICE 'PASS: web not_captured -> geo_status=not_captured, no distance/geofence';
END $$;

-- ── Test 5: feature flag OFF -> attendance still recorded, no geo values ─
RESET ROLE;
SELECT set_config('app.role', 'super_admin', true);
UPDATE public.schools
SET features_enabled = jsonb_set(features_enabled, '{attendance_geo}', 'false')
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

SELECT public.mark_attendance(
  'cccccccc-0000-0000-0000-000000000101'::uuid,
  'FULL_DAY'::public.attendance_session,
  '2026-08-18'::date,
  '[{"student_id":"bfbfe6c2-e175-4fbc-8605-f805e4251cb8","status":"present"}]'::jsonb,
  12.9716, 77.5946, 5, 'device'
);

DO $$
DECLARE r record;
BEGIN
  SELECT status, captured_lat, captured_lng, geo_status, geo_distance_m, matched_geofence_id
  INTO r
  FROM public.attendance_records
  WHERE student_id = 'bfbfe6c2-e175-4fbc-8605-f805e4251cb8' AND date = '2026-08-18' AND session = 'FULL_DAY';

  IF r.status IS DISTINCT FROM 'present' THEN
    RAISE EXCEPTION 'FAIL: flag-off case did not record attendance status: %', r;
  END IF;
  IF r.captured_lat IS NOT NULL OR r.captured_lng IS NOT NULL
     OR r.geo_status IS NOT NULL OR r.geo_distance_m IS NOT NULL OR r.matched_geofence_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: flag-off case wrote geo values despite attendance_geo=false: %', r;
  END IF;
  RAISE NOTICE 'PASS: feature flag OFF -> attendance recorded, all geo columns NULL';
END $$;

-- Restore flag for the remaining tests.
RESET ROLE;
SELECT set_config('app.role', 'super_admin', true);
UPDATE public.schools
SET features_enabled = jsonb_set(features_enabled, '{attendance_geo}', 'true')
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ── Test 6: geofence update -> re-submission uses current geofence, not stale data ─
-- Move the fence's radius so the previously-outside point (Test 2) is now inside.
UPDATE public.school_geofences
SET radius_m = 2000
WHERE id = 'e0000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000014"}', true);

SELECT public.mark_attendance(
  'cccccccc-0000-0000-0000-000000000101'::uuid,
  'FULL_DAY'::public.attendance_session,
  '2026-08-18'::date,
  '[{"student_id":"6773f432-0f68-41aa-ae3c-9892fbc4d796","status":"present"}]'::jsonb,
  12.9816, 77.5946, 8, 'device'
);

DO $$
DECLARE r record;
BEGIN
  SELECT geo_status, matched_geofence_id
  INTO r
  FROM public.attendance_records
  WHERE student_id = '6773f432-0f68-41aa-ae3c-9892fbc4d796' AND date = '2026-08-18' AND session = 'FULL_DAY';

  IF r.geo_status IS DISTINCT FROM 'inside' THEN
    RAISE EXCEPTION 'FAIL: geofence-update case geo_status = % (expected inside after radius widened)', r.geo_status;
  END IF;
  IF r.matched_geofence_id IS DISTINCT FROM 'e0000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL: geofence-update case matched_geofence_id = % (expected current fence)', r.matched_geofence_id;
  END IF;
  RAISE NOTICE 'PASS: geofence update -> re-submission reflects current geofence config, not stale data';
END $$;

RESET ROLE;
ROLLBACK;
