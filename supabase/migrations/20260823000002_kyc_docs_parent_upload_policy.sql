-- supabase/migrations/20260823000002_kyc_docs_parent_upload_policy.sql
--
-- Adds the minimum INSERT policy needed for a parent to upload their own
-- child's KYC document to the private 'kyc-docs' bucket. Modeled directly
-- on the existing student-photos parent-upload precedent
-- (20240001000025_parent_photo_upload.sql). Storage RLS runs outside
-- PostgREST's db_pre_request hook (see comment in
-- 20260803094937_kyc_bucket.sql), so this checks auth.uid() directly
-- against student_profiles rather than via get_my_role()/get_my_school_id().
-- Existing staff policies (kyc_docs_upload/modify/remove) are untouched. No
-- UPDATE/DELETE policy is granted to parents — a re-upload is a new INSERT
-- at a new timestamped path (existing upsert_kyc_document behavior), so
-- parents never need to modify or remove a storage object directly. Still
-- no SELECT policy — storage reads remain fully locked to the signed-URL
-- gates (web route + kyc-signed-url Edge Function), per the bucket's
-- original design.
--
-- Path convention: kyc/{school_id}/{subject_id}/{document_type_id}-{ts}.{ext}
-- → school at foldername[2], subject at foldername[3]. Both segments are
-- checked (mirroring the staff policy in 20260803094937_kyc_bucket.sql,
-- which binds role + school segment) so a bogus school prefix can't be used
-- to write an object outside the child's actual tenant.

CREATE POLICY kyc_docs_parent_upload ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-docs'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[3], '')::uuid)
    AND EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = NULLIF((storage.foldername(name))[3], '')::uuid
        AND sp.school_id::text = (storage.foldername(name))[2]
    )
  );
