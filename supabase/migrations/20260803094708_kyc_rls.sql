ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- Config, not sensitive — teachers need it to render the checklist.
CREATE POLICY document_types_select ON public.document_types FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'kyc_documents'))
);

-- Metadata visibility only — the actual FILE still routes through the signed-URL
-- endpoint (§3), which is the real access gate. teaches_student is safe here
-- since table RLS (normal PostgREST) runs with GUCs set, unlike Storage.
CREATE POLICY kyc_documents_select ON public.kyc_documents FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    school_id = public.get_my_school_id()
    AND public.feature_enabled(school_id, 'kyc_documents')
    AND (public.get_my_role() IN ('school_admin', 'principal') OR public.teaches_student(subject_id))
  )
);

-- No write policies on either table — all writes go through the SECURITY
-- DEFINER RPCs (save_document_type, upsert_kyc_document, verify_documents, reject_document).