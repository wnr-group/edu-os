-- Migration: 20240001000065_mark_attendance.sql
-- Geo attendance backend: feature_enabled helper and mark_attendance RPC

CREATE OR REPLACE FUNCTION public.feature_enabled(p_school_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT COALESCE(
    (features_enabled ->> p_key)::boolean,
    false
  )
  FROM public.schools
  WHERE id = p_school_id;
$$;

GRANT EXECUTE ON FUNCTION public.feature_enabled(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_section_id  uuid,
  p_session     public.attendance_session,
  p_date        date,
  p_records     jsonb,
  p_lat         numeric DEFAULT NULL,
  p_lng         numeric DEFAULT NULL,
  p_accuracy    numeric DEFAULT NULL,
  p_geo_source  text DEFAULT 'web'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_school_id           uuid;
  v_geo_enabled         boolean;
  v_geo_status          public.geo_status;
  v_geo_distance_m      numeric;
  v_matched_geofence_id uuid;
  v_captured_lat        numeric;
  v_captured_lng        numeric;
  v_captured_accuracy   numeric;
  v_nearest_id          uuid;
  v_nearest_radius      integer;
  v_nearest_dist        numeric;
  v_rec                 record;
BEGIN
  SELECT school_id INTO v_school_id FROM public.sections WHERE id = p_section_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'section_not_found';
  END IF;

  -- COALESCE(..., false) on the outer check: get_my_role()/get_my_school_id()
  -- return NULL whenever the caller omits the x-school-id/x-active-role scope
  -- headers (see scope_pre_request, migration 20240001000038). `IF NOT (NULL)`
  -- evaluates to NULL, which PL/pgSQL treats as false and SKIPS the RAISE —
  -- silently authorizing the call. RLS policies fail closed on a NULL
  -- USING/WITH CHECK clause; this hand-rolled check must be forced to do the
  -- same, or any authenticated caller that omits the headers (e.g. a direct
  -- RPC call bypassing the app's client wrapper) bypasses the role check
  -- entirely.
  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND v_school_id = public.get_my_school_id()
    )
    OR (
      public.get_my_role() = 'teacher'
      AND v_school_id = public.get_my_school_id()
      AND public.can_write_section_attendance(p_section_id)
    ),
    false
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_geo_enabled := public.feature_enabled(v_school_id, 'attendance_geo');

  IF NOT v_geo_enabled THEN
    v_geo_status          := NULL;
    v_geo_distance_m      := NULL;
    v_matched_geofence_id := NULL;
    v_captured_lat        := NULL;
    v_captured_lng        := NULL;
    v_captured_accuracy   := NULL;
  ELSIF p_lat IS NULL OR p_lng IS NULL THEN
    v_geo_status          := CASE WHEN p_geo_source = 'device' THEN 'no_gps'::public.geo_status
                                   ELSE 'not_captured'::public.geo_status END;
    v_geo_distance_m      := NULL;
    v_matched_geofence_id := NULL;
    v_captured_lat        := p_lat;
    v_captured_lng        := p_lng;
    v_captured_accuracy   := p_accuracy;
  ELSE
    v_captured_lat      := p_lat;
    v_captured_lng      := p_lng;
    v_captured_accuracy := p_accuracy;

    SELECT sg.id, sg.radius_m, public._haversine_m(p_lat, p_lng, sg.center_lat, sg.center_lng)
    INTO v_nearest_id, v_nearest_radius, v_nearest_dist
    FROM public.school_geofences sg
    WHERE sg.school_id = v_school_id AND sg.is_active = true
    ORDER BY public._haversine_m(p_lat, p_lng, sg.center_lat, sg.center_lng) ASC
    LIMIT 1;

    IF NOT FOUND THEN
      v_geo_status          := 'not_captured';
      v_geo_distance_m      := NULL;
      v_matched_geofence_id := NULL;
    ELSIF v_nearest_dist <= v_nearest_radius THEN
      v_geo_status          := 'inside';
      v_geo_distance_m      := v_nearest_dist - v_nearest_radius;
      v_matched_geofence_id := v_nearest_id;
    ELSE
      v_geo_status          := 'outside';
      v_geo_distance_m      := v_nearest_dist - v_nearest_radius;
      v_matched_geofence_id := NULL;
    END IF;
  END IF;

  FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_records) AS x(student_id uuid, status public.attendance_status)
  LOOP
    INSERT INTO public.attendance_records (
      student_id, section_id, school_id, date, session, status, marked_by,
      captured_lat, captured_lng, gps_accuracy_m,
      geo_status, geo_distance_m, matched_geofence_id
    ) VALUES (
      v_rec.student_id, p_section_id, v_school_id, p_date, p_session, v_rec.status, auth.uid(),
      v_captured_lat, v_captured_lng, v_captured_accuracy,
      v_geo_status, v_geo_distance_m, v_matched_geofence_id
    )
    ON CONFLICT (student_id, date, session) DO UPDATE SET
      status              = EXCLUDED.status,
      marked_by           = EXCLUDED.marked_by,
      captured_lat        = EXCLUDED.captured_lat,
      captured_lng        = EXCLUDED.captured_lng,
      gps_accuracy_m      = EXCLUDED.gps_accuracy_m,
      geo_status          = EXCLUDED.geo_status,
      geo_distance_m      = EXCLUDED.geo_distance_m,
      matched_geofence_id = EXCLUDED.matched_geofence_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, public.attendance_session, date, jsonb, numeric, numeric, numeric, text)
  TO authenticated;
