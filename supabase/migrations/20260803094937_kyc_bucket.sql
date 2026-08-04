INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('kyc-docs', 'kyc-docs', false, 5242880)
ON CONFLICT (id) DO NOTHING;

-- auth.uid()-direct — Storage never runs the PostgREST db_pre_request GUC
-- hook, so get_my_role()/get_my_school_id() read NULL here (migration 51/52's
-- rewrite). Path: kyc/{school_id}/{subject_id}/{document_type_id}-{ts}.{ext}
-- → school at foldername[2], subject at foldername[3].
CREATE POLICY kyc_docs_write ON storage.objects FOR ALL
USING (
  bucket_id = 'kyc-docs' AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.is_active
      AND ur.role IN ('super_admin', 'school_admin', 'principal')
      AND (ur.role = 'super_admin' OR ur.school_id::text = (storage.foldername(name))[2])
  )
)
WITH CHECK (
  bucket_id = 'kyc-docs' AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.is_active
      AND ur.role IN ('super_admin', 'school_admin', 'principal')
      AND (ur.role = 'super_admin' OR ur.school_id::text = (storage.foldername(name))[2])
  )
);

-- No SELECT policy on storage.objects for bucket 'kyc-docs' — reads are fully
-- locked to clients. The service-role signed-URL endpoint (Story B, API route)
-- is the sole read path and is itself the authz gate (strongest posture for
-- Aadhaar/birth certs, per §3).