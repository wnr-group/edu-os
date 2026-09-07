-- EDUOS-2026-08-18-01: Enable attendance_geo for Demo School so that the
-- mark_attendance RPC (20240001000065_mark_attendance.sql) can compute and
-- persist geo_status / geo_distance_m / matched_geofence_id.
--
-- Root cause of Bug-01 was TWO compounding issues:
--   1. Mobile client was doing a direct upsert to attendance_records instead
--      of calling mark_attendance — so geo classification was never triggered
--      regardless of the flag.  That code bug is fixed in [sectionId].tsx.
--   2. attendance_geo was seeded OFF (20260727132543_feature_flags.sql:
--      'attendance_geo', false) for all schools.  A geofence already exists
--      for Demo School (school_geofences), but the RPC's feature-flag guard
--      short-circuits everything to NULL when the flag is false.
--
-- The geofence for Demo School already exists:
--   name='School 1', center=(18.455735, 73.868142), radius=1000m, is_active=true
-- No geofence changes are required.
--
-- Uses the same jsonb-merge convention as 20260821000000: merges in exactly
-- this one key, leaves every other features_enabled key untouched.
-- Scoped to Demo School only.  Safe to re-run (idempotent).

UPDATE public.schools
SET features_enabled = features_enabled || '{"attendance_geo": true}'::jsonb
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
