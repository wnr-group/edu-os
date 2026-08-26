-- Carries forward the Student Health Records PR review-feedback fixes
-- (originally applied by editing the three migrations below in place) as a
-- new migration instead, per team policy: don't modify already-committed
-- migrations, layer corrections on top.
--   - supabase/migrations/20260819100100_student_health_records_rls.sql
--   - supabase/migrations/20260819120000_student_vaccinations.sql
--   - supabase/migrations/20260819120100_health_record_submissions.sql
-- Those three files are restored to their original (pre-review-feedback)
-- content; this migration reproduces the exact same intended final
-- behavior on top of them.

-- 1. health_records_select — gate the parent-visibility branch behind the
-- health_records feature flag, matching the staff branch above it.
ALTER POLICY health_records_select ON public.student_health_records USING (
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

-- 2. vaccinations_select — same gating on the parent-visibility branch.
ALTER POLICY vaccinations_select ON public.student_vaccinations USING (
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

-- 3. health_submissions_select — gate the submitter's own-row branch behind
-- the same flag.
ALTER POLICY health_submissions_select ON public.student_health_record_submissions USING (
  public.get_my_role() = 'super_admin'
  OR (
    school_id = public.get_my_school_id()
    AND public.feature_enabled(school_id, 'health_records')
    AND public.get_my_role() IN ('school_admin', 'principal')
  )
  OR (public.feature_enabled(school_id, 'health_records') AND submitted_by = auth.uid())
);

-- 4. _apply_health_record is SECURITY DEFINER but carries no authz checks of
-- its own (its callers below do that), so it must never be directly
-- reachable through PostgREST. Postgres grants EXECUTE to PUBLIC by default
-- on every new function, and everything in the public schema is exposed via
-- PostgREST regardless of naming convention — a leading underscore hides
-- nothing from the API. Only upsert_health_record and review_health_submission
-- may call it; both run SECURITY DEFINER (as the owner), so they're
-- unaffected by this revoke.
REVOKE EXECUTE ON FUNCTION public._apply_health_record(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

-- 5. review_health_submission — add the same health_records feature-flag
-- check the other health-record write paths already have. Signature,
-- return type, and SECURITY DEFINER/search_path characteristics are
-- unchanged from the original definition; only the added flag check below.
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
