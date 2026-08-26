ALTER TABLE public.student_health_records ENABLE ROW LEVEL SECURITY;

-- Admin/principal manage; teacher gets a read-only safety-relevant slice for
-- their own students (teaches_student, same helper KYC uses); parent reads
-- their own child's record only. No write policy — all writes go through
-- upsert_health_record below, same "no direct table writes" posture as KYC.
CREATE POLICY health_records_select ON public.student_health_records FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    school_id = public.get_my_school_id()
    AND public.feature_enabled(school_id, 'health_records')
    AND (public.get_my_role() IN ('school_admin', 'principal') OR public.teaches_student(student_id))
  )
  OR EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = student_id AND sp.parent_profile_id = auth.uid()
  )
);

GRANT SELECT ON public.student_health_records TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_health_record(
  p_student_id uuid,
  p_blood_group text,
  p_allergies text,
  p_chronic_conditions text,
  p_current_medications text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_emergency_contact_relation text,
  p_doctor_name text,
  p_doctor_phone text,
  p_special_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'invalid_student'; END IF;

  IF NOT public.feature_enabled(v_school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  INSERT INTO public.student_health_records
    (school_id, student_id, blood_group, allergies, chronic_conditions, current_medications,
     emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
     doctor_name, doctor_phone, special_notes, updated_by)
  VALUES
    (v_school_id, p_student_id, NULLIF(btrim(p_blood_group), ''), NULLIF(btrim(p_allergies), ''),
     NULLIF(btrim(p_chronic_conditions), ''), NULLIF(btrim(p_current_medications), ''),
     NULLIF(btrim(p_emergency_contact_name), ''), NULLIF(btrim(p_emergency_contact_phone), ''),
     NULLIF(btrim(p_emergency_contact_relation), ''), NULLIF(btrim(p_doctor_name), ''),
     NULLIF(btrim(p_doctor_phone), ''), NULLIF(btrim(p_special_notes), ''), auth.uid())
  ON CONFLICT (student_id) DO UPDATE
    SET blood_group = EXCLUDED.blood_group,
        allergies = EXCLUDED.allergies,
        chronic_conditions = EXCLUDED.chronic_conditions,
        current_medications = EXCLUDED.current_medications,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_relation = EXCLUDED.emergency_contact_relation,
        doctor_name = EXCLUDED.doctor_name,
        doctor_phone = EXCLUDED.doctor_phone,
        special_notes = EXCLUDED.special_notes,
        updated_by = auth.uid(),
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'health_record_upsert', 'student_health_records', v_id,
          jsonb_build_object('student_id', p_student_id));

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_health_record(uuid, text, text, text, text, text, text, text, text, text, text) TO authenticated;
