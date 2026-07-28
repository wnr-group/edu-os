-- Geo attendance backend, Task 1: schema.
-- Adds geo_status enum + nullable geo columns to attendance_records, and a
-- new school_geofences table (write locked to school_admin/super_admin only
-- — anti-spoof: a teacher-writable geofence would let them "draw a circle
-- around themselves, always inside"). All geo columns are nullable so
-- pre-geo, web-marked, and flag-off rows are unaffected.

CREATE TYPE public.geo_status AS ENUM ('inside', 'outside', 'no_gps', 'not_captured');

CREATE TABLE public.school_geofences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  center_lat NUMERIC NOT NULL,
  center_lng NUMERIC NOT NULL,
  radius_m   INTEGER NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_school_geofences_school_id ON public.school_geofences (school_id);

ALTER TABLE public.school_geofences ENABLE ROW LEVEL SECURITY;

-- Same-school authenticated read (mobile advisory chip + web review page).
CREATE POLICY "school_geofences_select" ON public.school_geofences FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR school_id = public.get_my_school_id()
  );

-- Write locked to school_admin + super_admin. Principal is read-only.
-- Teacher is read-only (anti-spoof).
CREATE POLICY "school_geofences_write" ON public.school_geofences FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
    )
  );

ALTER TABLE public.attendance_records
  ADD COLUMN captured_lat        NUMERIC,
  ADD COLUMN captured_lng        NUMERIC,
  ADD COLUMN gps_accuracy_m      NUMERIC,
  ADD COLUMN geo_status          public.geo_status,
  ADD COLUMN geo_distance_m      NUMERIC,
  ADD COLUMN matched_geofence_id UUID REFERENCES public.school_geofences(id) ON DELETE SET NULL,
  ADD COLUMN geo_reviewed_at     TIMESTAMPTZ,
  ADD COLUMN geo_reviewed_by     UUID REFERENCES auth.users(id);
