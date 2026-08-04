CREATE OR REPLACE FUNCTION public.finalize_conversion(
  p_app_id uuid, p_parent_profile_id uuid, p_section_id uuid, p_roll_number text, p_admission_number text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_app record;
  v_student_id uuid;
BEGIN
  SELECT * INTO v_app FROM public.admission_applications WHERE id = p_app_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_app.converted_student_id IS NOT NULL THEN RAISE EXCEPTION 'already_converted'; END IF;
  IF v_app.stage <> 'offered' THEN RAISE EXCEPTION 'not_offered'; END IF;

  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_app.school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  INSERT INTO public.student_profiles (school_id, full_name, email, admission_number, date_of_birth, gender, parent_profile_id)
  VALUES (v_app.school_id, v_app.applicant_name, v_app.parent_email, p_admission_number, v_app.date_of_birth, v_app.gender, p_parent_profile_id)
  RETURNING id INTO v_student_id;

  INSERT INTO public.student_enrollments (student_profile_id, academic_year_id, school_id, class_id, section_id, roll_number, is_active)
  VALUES (v_student_id, v_app.academic_year_id, v_app.school_id, v_app.class_applied_id, p_section_id, p_roll_number, true);

  UPDATE public.admission_applications
  SET converted_student_id = v_student_id, converted_at = now(), stage = 'enrolled', updated_at = now()
  WHERE id = p_app_id;

  INSERT INTO public.admission_stage_events (application_id, school_id, from_stage, to_stage, actor_id)
  VALUES (p_app_id, v_app.school_id, 'offered', 'enrolled', auth.uid());

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_app.school_id, auth.uid(), public.get_my_role(), 'admission_convert', 'admission_application', p_app_id,
          jsonb_build_object('student_id', v_student_id));

  RETURN v_student_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.finalize_conversion(uuid, uuid, uuid, text, text) TO authenticated;