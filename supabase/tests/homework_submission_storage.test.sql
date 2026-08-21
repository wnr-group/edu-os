-- supabase/tests/homework_submission_storage.test.sql
--
-- Security test for the parent-scoped INSERT policies on
-- storage.objects for bucket 'homework-submissions'
-- (20260824000002_homework_submissions_bucket.sql). Proves a parent can
-- only write under their own child's path segment, regardless of
-- what homework_id or school_id segment they put in the path (defense in
-- depth — the RPC is the authority on homework/school correctness; storage
-- policy is the authority on student ownership only).
--
-- Path convention: homework-submissions/{school_id}/{homework_id}/{student_id}/{ts}.{ext}
--   -> foldername[4] = student id.
-- Same demo-seed identities as kyc_parent_upload_storage.test.sql:
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001 (Parent A / Child A)
--   parent aaaaaaaa-...0013 -> student dddddddd-...0010 (Parent B / Child B)
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_storage.test.sql

BEGIN;

-- ── Case A: Parent A writes under their own child's path = ALLOW ───────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('homework-submissions', 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000001/1.pdf');
  RAISE NOTICE 'PASS: Parent A can INSERT into their own child''s homework-submissions path';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL: Parent A was denied writing to their own child''s homework-submissions path';
END $$;

-- ── Case B: Parent A CANNOT write under Parent B's child's path = DENY ─────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('homework-submissions', 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000010/1.pdf');
    RAISE EXCEPTION 'FAIL: Parent A wrote into Parent B''s child''s homework-submissions path';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Parent A denied writing to another parent''s child''s homework-submissions path';
  END;
END $$;

-- ── Case C: path-manipulated homework_id/school_id segment still gated by student segment ──
-- Even with a bogus school/homework segment, the student segment (foldername[4])
-- is what the policy checks — so this must still be denied for Parent A
-- writing to Child B's student id, proving the check isn't fooled by
-- rearranged/bogus upstream segments.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('homework-submissions', 'homework-submissions/00000000-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000/dddddddd-0000-0000-0000-000000000010/1.pdf');
    RAISE EXCEPTION 'FAIL: Parent A wrote using a manipulated path to Child B''s student segment';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Parent A denied even with bogus school/homework path segments (student segment still gates)';
  END;
END $$;

-- ── Case D: anonymous CANNOT write at all = DENY ────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('homework-submissions', 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000001/1.pdf');
    RAISE EXCEPTION 'FAIL: anon role wrote to homework-submissions';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon role denied writing to homework-submissions';
  END;
END $$;

ROLLBACK;
