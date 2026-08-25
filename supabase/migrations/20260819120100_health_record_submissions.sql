CREATE TYPE public.health_submission_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.student_health_record_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  blood_group text,
  allergies text,
  chronic_conditions text,
  current_medications text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  doctor_name text,
  doctor_phone text,
  special_notes text,
  status public.health_submission_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_submissions_student ON public.student_health_record_submissions(student_id);
CREATE INDEX idx_health_submissions_school_status ON public.student_health_record_submissions(school_id, status);
-- Enforced in the RPC (clearer error message) as well as here (belt and
-- suspenders against any future direct-write path): only one pending
-- submission per student at a time, per the "one pending at a time" rule.
CREATE UNIQUE INDEX idx_health_submissions_one_pending ON public.student_health_record_submissions(student_id) WHERE status = 'pending';

ALTER TABLE public.student_health_record_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_submissions_select ON public.student_health_record_submissions FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    school_id = public.get_my_school_id()
    AND public.feature_enabled(school_id, 'health_records')
    AND public.get_my_role() IN ('school_admin', 'principal')
  )
  OR (public.feature_enabled(school_id, 'health_records') AND submitted_by = auth.uid())
);
GRANT SELECT ON public.student_health_record_submissions TO authenticated;

-- Factored out of upsert_health_record so both a direct admin edit and an
-- approved parent submission write through the exact same path — no
-- duplicated INSERT/UPDATE logic between the two.
CREATE OR REPLACE FUNCTION public._apply_health_record(
  p_school_id uuid, p_student_id uuid,
  p_blood_group text, p_allergies text, p_chronic_conditions text, p_current_medications text,
  p_emergency_contact_name text, p_emergency_contact_phone text, p_emergency_contact_relation text,
  p_doctor_name text, p_doctor_phone text, p_special_notes text, p_updated_by uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.student_health_records
    (school_id, student_id, blood_group, allergies, chronic_conditions, current_medications,
     emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
     doctor_name, doctor_phone, special_notes, updated_by)
  VALUES
    (p_school_id, p_student_id, NULLIF(btrim(p_blood_group), ''), NULLIF(btrim(p_allergies), ''),
     NULLIF(btrim(p_chronic_conditions), ''), NULLIF(btrim(p_current_medications), ''),
     NULLIF(btrim(p_emergency_contact_name), ''), NULLIF(btrim(p_emergency_contact_phone), ''),
     NULLIF(btrim(p_emergency_contact_relation), ''), NULLIF(btrim(p_doctor_name), ''),
     NULLIF(btrim(p_doctor_phone), ''), NULLIF(btrim(p_special_notes), ''), p_updated_by)
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
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Private helper: it deliberately carries no authz checks of its own (its
-- callers below do that), so it must never be reachable through PostgREST.
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- everything in the public schema is exposed via PostgREST regardless of
-- naming convention — a leading underscore hides nothing from the API.
-- Only upsert_health_record and review_health_submission may call it; both
-- run SECURITY DEFINER (as the owner), so they're unaffected by this revoke.
REVOKE EXECUTE ON FUNCTION public._apply_health_record(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

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

  v_id := public._apply_health_record(
    v_school_id, p_student_id, p_blood_group, p_allergies, p_chronic_conditions, p_current_medications,
    p_emergency_contact_name, p_emergency_contact_phone, p_emergency_contact_relation,
    p_doctor_name, p_doctor_phone, p_special_notes, auth.uid()
  );

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'health_record_upsert', 'student_health_records', v_id,
          jsonb_build_object('student_id', p_student_id));

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_health_record(uuid, text, text, text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_health_record_update(
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
  IF public.get_my_role() <> 'parent' THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id INTO v_school_id FROM public.student_profiles
  WHERE id = p_student_id AND parent_profile_id = auth.uid();
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  IF EXISTS (SELECT 1 FROM public.student_health_record_submissions WHERE student_id = p_student_id AND status = 'pending') THEN
    RAISE EXCEPTION 'pending_submission_exists';
  END IF;

  INSERT INTO public.student_health_record_submissions
    (school_id, student_id, submitted_by, blood_group, allergies, chronic_conditions, current_medications,
     emergency_contact_name, emergency_contact_phone, emergency_contact_relation, doctor_name, doctor_phone, special_notes)
  VALUES
    (v_school_id, p_student_id, auth.uid(), NULLIF(btrim(p_blood_group), ''), NULLIF(btrim(p_allergies), ''),
     NULLIF(btrim(p_chronic_conditions), ''), NULLIF(btrim(p_current_medications), ''),
     NULLIF(btrim(p_emergency_contact_name), ''), NULLIF(btrim(p_emergency_contact_phone), ''),
     NULLIF(btrim(p_emergency_contact_relation), ''), NULLIF(btrim(p_doctor_name), ''),
     NULLIF(btrim(p_doctor_phone), ''), NULLIF(btrim(p_special_notes), ''))
  RETURNING id INTO v_id;

  -- Notify school staff a submission is awaiting review.
  INSERT INTO public.notifications (school_id, user_id, student_id, title, body, type)
  SELECT v_school_id, ur.user_id, p_student_id, 'Health record update submitted',
         'A parent submitted a health record update awaiting your review.', 'health_submission'
  FROM public.user_roles ur
  WHERE ur.school_id = v_school_id AND ur.role IN ('school_admin', 'principal') AND ur.is_active;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_health_record_update(uuid, text, text, text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_health_submission(p_id uuid, p_approve boolean, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub record;
BEGIN
  SELECT * INTO v_sub FROM public.student_health_record_submissions WHERE id = p_id;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_sub.school_id, 'health_records') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF v_sub.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_sub.school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.student_health_record_submissions
  SET status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END)::public.health_submission_status,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(btrim(p_note), '')
  WHERE id = p_id;

  IF p_approve THEN
    PERFORM public._apply_health_record(
      v_sub.school_id, v_sub.student_id, v_sub.blood_group, v_sub.allergies, v_sub.chronic_conditions,
      v_sub.current_medications, v_sub.emergency_contact_name, v_sub.emergency_contact_phone,
      v_sub.emergency_contact_relation, v_sub.doctor_name, v_sub.doctor_phone, v_sub.special_notes, v_sub.submitted_by
    );
  END IF;

  INSERT INTO public.notifications (school_id, user_id, student_id, title, body, type)
  VALUES (
    v_sub.school_id, v_sub.submitted_by, v_sub.student_id,
    CASE WHEN p_approve THEN 'Health record update approved' ELSE 'Health record update rejected' END,
    CASE WHEN p_approve THEN 'Your submitted health record update has been approved and applied.'
         ELSE 'Your submitted health record update was rejected.' || CASE WHEN p_note IS NOT NULL THEN ' Reason: ' || p_note ELSE '' END
    END,
    'health_submission_reviewed'
  );

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_sub.school_id, auth.uid(), public.get_my_role(),
          CASE WHEN p_approve THEN 'health_submission_approve' ELSE 'health_submission_reject' END,
          'student_health_record_submissions', p_id, jsonb_build_object('student_id', v_sub.student_id, 'note', p_note));
END; $$;
GRANT EXECUTE ON FUNCTION public.review_health_submission(uuid, boolean, text) TO authenticated;
