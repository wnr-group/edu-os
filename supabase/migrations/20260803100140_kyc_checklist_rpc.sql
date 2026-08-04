CREATE OR REPLACE FUNCTION public.get_student_kyc_checklist(p_student_id uuid)
RETURNS TABLE (
  document_type_id uuid, document_type_name text, is_required boolean, expires boolean,
  document_id uuid, file_name text, file_type text, file_size integer,
  status public.kyc_doc_status, rejection_reason text, expires_on date,
  verified_by_name text, verified_at timestamptz, uploaded_by_name text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
  WHERE dt.school_id = (SELECT school_id FROM public.student_profiles WHERE id = p_student_id)
    AND dt.subject_type = 'student' AND dt.is_active
  ORDER BY dt.sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_kyc_checklist(uuid) TO authenticated;