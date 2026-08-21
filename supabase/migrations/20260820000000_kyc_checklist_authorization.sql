-- supabase/migrations/20260820000000_kyc_checklist_authorization.sql
--
-- get_student_kyc_checklist(p_student_id uuid) is SECURITY DEFINER but has
-- never had a caller-authorization check: any authenticated user could pass
-- any student_id and read that student's KYC checklist (document names,
-- statuses, rejection reasons). This was a latent gap on Web (only called
-- from the admin dashboard, which gated it via UI role checks) that would
-- become exploitable the moment Mobile calls this RPC directly for a parent
-- read path. This migration adds the missing check, reusing the same
-- role/relationship logic already used by kyc_documents_select RLS:
--   - super_admin: full access
--   - the student's own parent (student_profiles.parent_profile_id = auth.uid())
--   - school_admin / principal in the student's school, when the
--     kyc_documents feature is enabled for that school
--   - a teacher who teaches the student (public.teaches_student), when the
--     kyc_documents feature is enabled for that school
-- Everyone else gets zero rows. Response shape and business logic are
-- otherwise byte-for-byte identical to before.

CREATE OR REPLACE FUNCTION public.get_student_kyc_checklist(p_student_id uuid)
RETURNS TABLE (
  document_type_id uuid, document_type_name text, is_required boolean, expires boolean,
  document_id uuid, file_name text, file_type text, file_size integer,
  status public.kyc_doc_status, rejection_reason text, expires_on date,
  verified_by_name text, verified_at timestamptz, uploaded_by_name text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid;
  v_role text;
  v_is_parent boolean := false;
  v_is_staff boolean := false;
  v_authorized boolean := false;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_role := public.get_my_role();

  IF v_role = 'super_admin' THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = p_student_id AND sp.parent_profile_id = auth.uid()
    ) INTO v_is_parent;

    v_is_staff := (v_role IN ('school_admin', 'principal')) OR public.teaches_student(p_student_id);

    v_authorized := COALESCE(
      public.feature_enabled(v_school_id, 'kyc_documents')
        AND public.get_my_school_id() = v_school_id
        AND (v_is_parent OR v_is_staff),
      false
    );
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dt.id, dt.name, dt.is_required, dt.expires,
    kd.id, kd.file_name, kd.file_type, kd.file_size,
    kd.status, kd.rejection_reason, kd.expires_on,
    vp.full_name, kd.verified_at, up.full_name, kd.created_at
  FROM public.document_types dt
  LEFT JOIN public.kyc_documents kd
    ON kd.document_type_id = dt.id AND kd.subject_id = p_student_id AND kd.subject_type = 'student'
  LEFT JOIN public.profiles vp ON vp.id = kd.verified_by
  LEFT JOIN public.profiles up ON up.id = kd.uploaded_by
  WHERE dt.school_id = v_school_id
    AND dt.subject_type = 'student' AND dt.is_active
  ORDER BY dt.sort_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_kyc_checklist(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_student_kyc_checklist(uuid) TO authenticated;
