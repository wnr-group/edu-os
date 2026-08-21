-- Lets document types be classified without name-matching, so the Health
-- tab can reliably show only medical documents (Birth Certificate etc. stay
-- out of it) and future categories can be added the same way.
ALTER TABLE public.document_types ADD COLUMN category text NOT NULL DEFAULT 'general';
ALTER TABLE public.document_types ADD CONSTRAINT document_types_category_check CHECK (category IN ('general', 'medical'));

UPDATE public.document_types SET category = 'medical' WHERE name = 'Medical / Vaccination';

CREATE OR REPLACE FUNCTION public.seed_document_types(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.document_types WHERE school_id = p_school_id) THEN
    RETURN; -- already seeded
  END IF;

  INSERT INTO public.document_types (school_id, name, description, is_required, expires, default_validity_months, is_custom, sort_order, category) VALUES
    (p_school_id, 'Birth Certificate',    NULL,                          true,  false, NULL, false, 1, 'general'),
    (p_school_id, 'Transfer Certificate', 'From the previous school',    true,  false, NULL, false, 2, 'general'),
    (p_school_id, 'Previous Marksheet',   'Last report card / marksheet',true,  false, NULL, false, 3, 'general'),
    (p_school_id, 'Passport Photo',       'Recent colour photograph',    true,  false, NULL, false, 4, 'general'),
    (p_school_id, 'Address Proof',        'Utility bill / ration card',  true,  false, NULL, false, 5, 'general'),
    (p_school_id, 'Aadhaar Card',         'Optional for minors',         false, false, NULL, false, 6, 'general'),
    (p_school_id, 'Medical / Vaccination','Immunisation record',         false, true,  12,   false, 7, 'medical');
END; $$;
GRANT EXECUTE ON FUNCTION public.seed_document_types(uuid) TO authenticated;

-- Adds `category` to the checklist RPC's return columns. CREATE OR REPLACE
-- cannot change a function's return shape, so this must drop and recreate —
-- purely additive for existing callers (student-documents-tab.tsx), since
-- PostgREST returns named JSON fields, not positional tuples.
DROP FUNCTION public.get_student_kyc_checklist(uuid);

CREATE FUNCTION public.get_student_kyc_checklist(p_student_id uuid)
RETURNS TABLE(
  document_type_id uuid, document_type_name text, category text, is_required boolean, expires boolean,
  document_id uuid, file_name text, file_type text, file_size integer,
  status public.kyc_doc_status, rejection_reason text, expires_on date,
  verified_by_name text, verified_at timestamptz, uploaded_by_name text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
  WHERE dt.school_id = (SELECT school_id FROM public.student_profiles WHERE id = p_student_id)
    AND dt.subject_type = 'student' AND dt.is_active
  ORDER BY dt.sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_kyc_checklist(uuid) TO authenticated;
