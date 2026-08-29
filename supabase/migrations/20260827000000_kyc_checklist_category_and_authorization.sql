-- supabase/migrations/20260827000000_kyc_checklist_category_and_authorization.sql
--
-- Reconciles two migrations that both redefine get_student_kyc_checklist and
-- collide on return shape when replayed together:
--   - 20260819110000_document_types_category.sql (this branch) added a
--     `category` column to the return table via DROP FUNCTION + CREATE FUNCTION.
--   - 20260820000000_kyc_checklist_authorization.sql (main) added caller
--     authorization via CREATE OR REPLACE FUNCTION, unaware of `category` and
--     built on the pre-category 15-column shape.
-- CREATE OR REPLACE cannot change an existing function's return type, so
-- applying both in migration order fails with "cannot change return type of
-- existing function". Neither of those two files may be edited (already
-- merged/shared) — this migration is the union of both: the authorization
-- body from 20260820000000, plus the `category` column and its SELECT value
-- from 20260819110000. DROP + CREATE is required (not CREATE OR REPLACE)
-- because the return shape is changing again here, on top of both parents.

DROP FUNCTION public.get_student_kyc_checklist(uuid);

CREATE FUNCTION public.get_student_kyc_checklist(p_student_id uuid)
RETURNS TABLE(
  document_type_id uuid, document_type_name text, category text, is_required boolean, expires boolean,
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
    dt.id, dt.name, dt.category, dt.is_required, dt.expires,
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
