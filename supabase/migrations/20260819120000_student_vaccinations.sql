CREATE TABLE public.student_vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  vaccine_name text NOT NULL,
  dose_number integer,
  administered_date date,
  next_due_date date,
  notes text,
  reminder_sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vaccinations_student ON public.student_vaccinations(student_id);
CREATE INDEX idx_vaccinations_due ON public.student_vaccinations(next_due_date) WHERE next_due_date IS NOT NULL;

ALTER TABLE public.student_vaccinations ENABLE ROW LEVEL SECURITY;

-- Same visibility shape as student_health_records: admin/principal manage,
-- teacher reads own students, parent reads own child. No write policy — all
-- writes go through the RPCs below.
CREATE POLICY vaccinations_select ON public.student_vaccinations FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    school_id = public.get_my_school_id()
    AND public.feature_enabled(school_id, 'health_records')
    AND (public.get_my_role() IN ('school_admin', 'principal') OR public.teaches_student(student_id))
  )
  OR (
    public.feature_enabled(school_id, 'health_records')
    AND EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_id AND sp.parent_profile_id = auth.uid()
    )
  )
);
GRANT SELECT ON public.student_vaccinations TO authenticated;

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
  v_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'invalid_student'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_vaccine_name IS NULL OR btrim(p_vaccine_name) = '' THEN RAISE EXCEPTION 'vaccine_name_required'; END IF;

  IF p_id IS NOT NULL THEN
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

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_vaccination(uuid, uuid, text, integer, date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_vaccination(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_vaccinations WHERE id = p_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  DELETE FROM public.student_vaccinations WHERE id = p_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'vaccination_delete', 'student_vaccinations', p_id, '{}'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_vaccination(uuid) TO authenticated;
