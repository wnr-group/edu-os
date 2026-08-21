-- supabase/migrations/20260824000002_homework_submissions_bucket.sql
--
-- Private bucket for parent-uploaded homework submissions. Modeled directly
-- on kyc-docs (20260803094937_kyc_bucket.sql,
-- 20260823000002_kyc_docs_parent_upload_policy.sql): no SELECT policy at
-- storage-bucket level (except for parents, since Supabase Storage API explicitly
-- requires SELECT permissions in order to evaluate DELETE permissions).
-- Teacher downloads flow exclusively through the signed-URL Edge Function. (next-but-one task). Storage RLS runs outside PostgREST's
-- db_pre_request hook, so policies check auth.uid() directly against
-- student_profiles via is_parent_of_student(), not get_my_role()/
-- get_my_school_id().
--
-- Path convention: homework-submissions/{school_id}/{homework_id}/{student_id}/{ts}.{ext}
--   -> school at foldername[2], homework at foldername[3], student at foldername[4].
-- The student segment (foldername[4]) is the only thing this policy checks —
-- school/homework correctness is enforced by submit_homework() itself
-- (defense in depth, not redundant: a bogus homework/school segment here
-- can't leak another student's file, and can't produce a persisted
-- submission row either, since the RPC independently re-validates the real
-- homework-to-student relationship).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('homework-submissions', 'homework-submissions', false, 5242880);

CREATE POLICY homework_submissions_parent_upload ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'homework-submissions'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[4], '')::uuid)
  );

CREATE POLICY homework_submissions_parent_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'homework-submissions'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[4], '')::uuid)
  );

CREATE POLICY homework_submissions_parent_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'homework-submissions'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[4], '')::uuid)
  );
