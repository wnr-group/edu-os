-- supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql
--
-- upsert_kyc_document() has been staff-only (super_admin/school_admin/
-- principal) since it was introduced. Rahul approved parents uploading KYC
-- documents for their own child (docs/superpowers/plans/2026-08-19-parent-kyc-upload.md).
-- This adds a parent-of-subject authorization branch alongside the existing
-- staff check, reusing the same student_profiles.parent_profile_id =
-- auth.uid() relationship check already used by get_student_kyc_checklist
-- (20260820000000) and the fees RLS policies (20240001000012). Staff
-- authorization, upsert semantics, resulting status, and audit_log
-- recording are all unchanged.

CREATE OR REPLACE FUNCTION public.upsert_kyc_document(
  p_subject_id uuid, p_document_type_id uuid, p_file_path text,
  p_file_name text, p_file_type text, p_file_size integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_dt_school_id uuid;
  v_id uuid;
  v_is_parent boolean;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_subject_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'invalid_subject'; END IF;

  IF NOT public.feature_enabled(v_school_id, 'kyc_documents') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = p_subject_id AND sp.parent_profile_id = auth.uid()
  ) INTO v_is_parent;

  IF NOT (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') OR v_is_parent) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT school_id INTO v_dt_school_id FROM public.document_types WHERE id = p_document_type_id;
  IF v_dt_school_id IS NULL OR v_dt_school_id <> v_school_id THEN RAISE EXCEPTION 'invalid_document_type'; END IF;

  INSERT INTO public.kyc_documents
    (school_id, subject_type, subject_id, document_type_id, file_path, file_name, file_type, file_size, status, uploaded_by)
  VALUES
    (v_school_id, 'student', p_subject_id, p_document_type_id, p_file_path, p_file_name, p_file_type, p_file_size, 'submitted', auth.uid())
  ON CONFLICT (school_id, subject_type, subject_id, document_type_id) DO UPDATE
    SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name, file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size, status = 'submitted', uploaded_by = auth.uid(),
        verified_by = NULL, verified_at = NULL, rejection_reason = NULL, expires_on = NULL
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'kyc_upload', 'kyc_documents', v_id,
          jsonb_build_object('subject_id', p_subject_id, 'document_type_id', p_document_type_id));

  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.upsert_kyc_document(uuid, uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_kyc_document(uuid, uuid, text, text, text, integer) TO authenticated;
