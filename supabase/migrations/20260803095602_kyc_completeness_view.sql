CREATE OR REPLACE VIEW public.student_kyc_completeness
WITH (security_invoker = true) AS
SELECT
  sp.id AS student_id,
  sp.school_id,
  sp.full_name AS student_name,
  (SELECT count(*) FROM public.document_types dt
   WHERE dt.school_id = sp.school_id AND dt.subject_type = 'student' AND dt.is_active AND dt.is_required) AS required_total,
  (SELECT count(*) FROM public.kyc_documents kd JOIN public.document_types dt ON dt.id = kd.document_type_id
   WHERE kd.school_id = sp.school_id AND kd.subject_id = sp.id
     AND dt.is_active AND dt.is_required
     AND kd.status = 'verified' AND (kd.expires_on IS NULL OR kd.expires_on >= current_date)) AS verified_count,
  (SELECT count(*) FROM public.kyc_documents kd JOIN public.document_types dt ON dt.id = kd.document_type_id
   WHERE kd.school_id = sp.school_id AND kd.subject_id = sp.id
     AND dt.is_active AND dt.is_required AND kd.status = 'submitted') AS pending_count
FROM public.student_profiles sp;

GRANT SELECT ON public.student_kyc_completeness TO authenticated;