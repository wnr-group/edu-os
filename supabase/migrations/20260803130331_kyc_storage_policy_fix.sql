DROP POLICY IF EXISTS kyc_docs_write ON storage.objects;

CREATE POLICY kyc_docs_upload ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-docs' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.is_active
        AND ur.role IN ('super_admin', 'school_admin', 'principal')
        AND (ur.role = 'super_admin' OR ur.school_id::text = (storage.foldername(name))[2])
    )
  );

CREATE POLICY kyc_docs_modify ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'kyc-docs' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.is_active
        AND ur.role IN ('super_admin', 'school_admin', 'principal')
        AND (ur.role = 'super_admin' OR ur.school_id::text = (storage.foldername(name))[2])
    )
  );

CREATE POLICY kyc_docs_remove ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'kyc-docs' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.is_active
        AND ur.role IN ('super_admin', 'school_admin', 'principal')
        AND (ur.role = 'super_admin' OR ur.school_id::text = (storage.foldername(name))[2])
    )
  );
-- Still no SELECT policy — storage reads remain fully locked to the signed-URL endpoint.