-- Vaccination create/edit/delete never notified the parent — audit_log was
-- written but notifications was not, so the manual test inserts used
-- earlier (to test the reminder cron) worked while the real UI flow never
-- did. Adds the missing insert, following the exact same pattern already
-- used by submit_health_record_update/review_health_submission.

CREATE OR REPLACE FUNCTION public.upsert_vaccination(
  p_id uuid,
  p_student_id uuid,
  p_vaccine_name text,
  p_dose_number integer,
  p_administered_date date,
  p_next_due_date date,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_parent_id uuid;
  v_id uuid;
  v_is_new boolean;
BEGIN
  SELECT school_id, parent_profile_id INTO v_school_id, v_parent_id FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'invalid_student'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_vaccine_name IS NULL OR btrim(p_vaccine_name) = '' THEN RAISE EXCEPTION 'vaccine_name_required'; END IF;

  v_is_new := p_id IS NULL;

  IF NOT v_is_new THEN
    UPDATE public.student_vaccinations
    SET vaccine_name = btrim(p_vaccine_name), dose_number = p_dose_number,
        administered_date = p_administered_date, next_due_date = p_next_due_date,
        notes = NULLIF(btrim(p_notes), ''), updated_at = now(),
        reminder_sent_at = CASE WHEN next_due_date IS DISTINCT FROM p_next_due_date THEN NULL ELSE reminder_sent_at END
    WHERE id = p_id AND student_id = p_student_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  ELSE
    INSERT INTO public.student_vaccinations
      (school_id, student_id, vaccine_name, dose_number, administered_date, next_due_date, notes, created_by)
    VALUES
      (v_school_id, p_student_id, btrim(p_vaccine_name), p_dose_number, p_administered_date, p_next_due_date, NULLIF(btrim(p_notes), ''), auth.uid())
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'vaccination_upsert', 'student_vaccinations', v_id,
          jsonb_build_object('student_id', p_student_id, 'vaccine_name', p_vaccine_name));

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO public.notifications (school_id, user_id, student_id, title, body, type)
    VALUES (
      v_school_id, v_parent_id, p_student_id,
      CASE WHEN v_is_new THEN 'Vaccination record added' ELSE 'Vaccination record updated' END,
      btrim(p_vaccine_name) || CASE WHEN v_is_new THEN ' has been added to the vaccination record.'
                                     ELSE ' vaccination record has been updated.' END
        || CASE WHEN p_next_due_date IS NOT NULL THEN ' Next due: ' || p_next_due_date::text || '.' ELSE '' END,
      'vaccination_added'
    );
  END IF;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_vaccination(uuid, uuid, text, integer, date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_vaccination(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_student_id uuid;
  v_vaccine_name text;
  v_parent_id uuid;
BEGIN
  SELECT sv.school_id, sv.student_id, sv.vaccine_name, sp.parent_profile_id
  INTO v_school_id, v_student_id, v_vaccine_name, v_parent_id
  FROM public.student_vaccinations sv
  JOIN public.student_profiles sp ON sp.id = sv.student_id
  WHERE sv.id = p_id;

  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  DELETE FROM public.student_vaccinations WHERE id = p_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'vaccination_delete', 'student_vaccinations', p_id,
          jsonb_build_object('student_id', v_student_id, 'vaccine_name', v_vaccine_name));

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO public.notifications (school_id, user_id, student_id, title, body, type)
    VALUES (
      v_school_id, v_parent_id, v_student_id,
      'Vaccination record removed',
      v_vaccine_name || ' has been removed from the vaccination record.',
      'vaccination_removed'
    );
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_vaccination(uuid) TO authenticated;
