-- supabase/migrations/20260824000002_homework_submissions_bucket.sql
--
-- Private bucket for parent-uploaded homework submissions. Modeled directly
-- on kyc-docs (20260803094937_kyc_bucket.sql,
-- 20260823000002_kyc_docs_parent_upload_policy.sql): no SELECT/DELETE policy
-- at storage-bucket level for parents — they only INSERT. Cleanup of a
-- superseded file on re-upload is best-effort from the client (see
-- apps/mobile/lib/homework.ts submitHomework) and, if it can't run because
-- there's no DELETE grant, the old object is simply orphaned (≤5MB, reconciled
-- by a periodic sweep against homework_submissions.file_path) rather than
-- granting parents a path to unsubmit past the deadline by deleting the
-- object directly instead of replacing it through submit_homework().
-- Teacher downloads flow exclusively through the signed-URL Edge Function
-- (next-but-one task). Storage RLS runs outside PostgREST's db_pre_request
-- hook, so policies check auth.uid() directly against student_profiles via
-- is_parent_of_student(), not get_my_role()/get_my_school_id().
--
-- Path convention: homework-submissions/{school_id}/{homework_id}/{student_id}/{ts}.{ext}
--   -> school at foldername[2], homework at foldername[3], student at foldername[4].
-- The policy checks both the student segment (foldername[4]) and that the
-- school segment (foldername[2]) matches the student's actual school — the
-- homework segment is left to submit_homework() itself (defense in depth,
-- not redundant: a bogus homework segment here can't leak another student's
-- file, and can't produce a persisted submission row either, since the RPC
-- independently re-validates the real homework-to-student relationship).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('homework-submissions', 'homework-submissions', false, 5242880)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY homework_submissions_parent_upload ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'homework-submissions'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[4], '')::uuid)
    AND EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = NULLIF((storage.foldername(name))[4], '')::uuid
        AND sp.school_id::text = (storage.foldername(name))[2]
    )
  );
