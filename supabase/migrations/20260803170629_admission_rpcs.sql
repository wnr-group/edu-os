CREATE OR REPLACE FUNCTION public.create_walkin_application(
  p_school_id uuid, p_applicant_name text, p_date_of_birth date, p_gender text,
  p_class_applied_id uuid, p_parent_name text, p_parent_phone text, p_parent_email text,
  p_previous_school text, p_area text, p_applicant_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_year_id uuid;
  v_ref_seq integer;
  v_app_id uuid;
BEGIN
  IF NOT public.feature_enabled(p_school_id, 'admissions') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND p_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT admission_academic_year_id INTO v_year_id FROM public.admission_settings WHERE school_id = p_school_id;
  IF v_year_id IS NULL THEN
    v_year_id := public.get_active_academic_year(p_school_id);
  END IF;

  INSERT INTO public.admission_settings (school_id) VALUES (p_school_id)
    ON CONFLICT (school_id) DO NOTHING;

  UPDATE public.admission_settings SET next_ref_seq = next_ref_seq + 1
    WHERE school_id = p_school_id
    RETURNING next_ref_seq - 1 INTO v_ref_seq;

  INSERT INTO public.admission_applications
    (school_id, academic_year_id, reference_no, applicant_name, date_of_birth, gender, class_applied_id,
     parent_name, parent_phone, parent_email, previous_school, area, applicant_note,
     stage, source, payment_status, created_by)
  VALUES
    (p_school_id, v_year_id, 'A-' || v_ref_seq, p_applicant_name, p_date_of_birth, p_gender, p_class_applied_id,
     p_parent_name, p_parent_phone, p_parent_email, p_previous_school, p_area, p_applicant_note,
     'enquiry', 'walk_in', 'not_required', auth.uid())
  RETURNING id INTO v_app_id;

  INSERT INTO public.admission_stage_events (application_id, school_id, from_stage, to_stage, actor_id)
  VALUES (v_app_id, p_school_id, NULL, 'enquiry', auth.uid());

  RETURN v_app_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_walkin_application(uuid, text, date, text, uuid, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_application(p_id uuid, p_to_stage public.admission_stage, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_from_stage public.admission_stage;
BEGIN
  IF p_to_stage = 'enrolled' THEN RAISE EXCEPTION 'use_convert_flow'; END IF;

  SELECT school_id, stage INTO v_school_id, v_from_stage FROM public.admission_applications WHERE id = p_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'admissions') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.admission_applications
  SET stage = p_to_stage,
      rejection_reason = CASE WHEN p_to_stage = 'rejected' THEN p_note ELSE rejection_reason END,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.admission_stage_events (application_id, school_id, from_stage, to_stage, actor_id, note)
  VALUES (p_id, v_school_id, v_from_stage, p_to_stage, auth.uid(), p_note);
END; $$;
GRANT EXECUTE ON FUNCTION public.advance_application(uuid, public.admission_stage, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_application_review(
  p_id uuid, p_score numeric, p_docs_reviewed boolean, p_docs_note text,
  p_internal_notes text, p_assigned_to uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.admission_applications WHERE id = p_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'admissions') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.admission_applications
  SET entrance_test_score = p_score, docs_reviewed = p_docs_reviewed, docs_note = NULLIF(btrim(p_docs_note), ''),
      internal_notes = NULLIF(btrim(p_internal_notes), ''), assigned_to = p_assigned_to, updated_at = now()
  WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.save_application_review(uuid, numeric, boolean, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_admission_settings(
  p_school_id uuid, p_is_open boolean, p_fee integer, p_year_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND p_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_fee > 0 AND NOT public.feature_enabled(p_school_id, 'online_payments') THEN
    RAISE EXCEPTION 'online_payments_required_for_fee';
  END IF;

  INSERT INTO public.admission_settings (school_id, is_open, application_fee, admission_academic_year_id, updated_by, updated_at)
  VALUES (p_school_id, p_is_open, p_fee, p_year_id, auth.uid(), now())
  ON CONFLICT (school_id) DO UPDATE
    SET is_open = p_is_open, application_fee = p_fee, admission_academic_year_id = p_year_id,
        updated_by = auth.uid(), updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.save_admission_settings(uuid, boolean, integer, uuid) TO authenticated;

-- The only anon read path. Returns public-safe data only — never internal fields.
CREATE OR REPLACE FUNCTION public.get_public_admission_config(p_school_domain text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school record;
  v_settings record;
  v_year_id uuid;
  v_classes jsonb;
BEGIN
  SELECT id, name, primary_color, is_active INTO v_school
  FROM public.schools WHERE domain = p_school_domain;

  IF v_school.id IS NULL OR NOT v_school.is_active THEN RETURN NULL; END IF;
  IF NOT public.feature_enabled(v_school.id, 'admissions') THEN RETURN NULL; END IF;

  SELECT * INTO v_settings FROM public.admission_settings WHERE school_id = v_school.id;
  v_year_id := COALESCE(v_settings.admission_academic_year_id, public.get_active_academic_year(v_school.id));

  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.order)
    INTO v_classes
  FROM public.classes c WHERE c.school_id = v_school.id;

  RETURN jsonb_build_object(
    'school_id', v_school.id,
    'school_name', v_school.name,
    'primary_color', v_school.primary_color,
    'is_open', COALESCE(v_settings.is_open, false),
    'application_fee', CASE WHEN public.feature_enabled(v_school.id, 'online_payments')
                             THEN COALESCE(v_settings.application_fee, 0) ELSE 0 END,
    'classes', COALESCE(v_classes, '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_public_admission_config(text) TO anon, authenticated;