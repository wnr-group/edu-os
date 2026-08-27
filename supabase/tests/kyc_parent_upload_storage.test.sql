-- supabase/tests/kyc_parent_upload_storage.test.sql
--
-- Security test for the parent-scoped INSERT policy on storage.objects for
-- bucket 'kyc-docs' (20260823000002_kyc_docs_parent_upload_policy.sql).
-- Proves a parent can only write under their own child's path segment.
-- Same demo-seed identities as kyc_parent_upload_rpc.test.sql:
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001 (Parent A / Child A)
--   parent aaaaaaaa-...0013 -> student dddddddd-...0010 (Parent B / Child B)
-- Run: npx supabase db query --local -f supabase/tests/kyc_parent_upload_storage.test.sql

BEGIN;

-- ── Case A: Parent A writes under their own child's path = ALLOW ───────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('kyc-docs', 'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000002-1.pdf');
  RAISE NOTICE 'PASS: Parent A can INSERT into their own child''s kyc-docs path';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL: Parent A was denied writing to their own child''s kyc-docs path';
END $$;

-- ── Case B: Parent A CANNOT write under Parent B's child's path = DENY ─────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('kyc-docs', 'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000010/eeeeeeee-0000-0000-0000-000000000002-1.pdf');
    RAISE EXCEPTION 'FAIL: Parent A wrote into Parent B''s child''s kyc-docs path';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Parent A denied writing to another parent''s child''s kyc-docs path';
  END;
END $$;

-- ── Case C: unrelated Parent B CANNOT write under Child A's path = DENY ────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('kyc-docs', 'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000002-1.pdf');
    RAISE EXCEPTION 'FAIL: Parent B wrote into Child A''s kyc-docs path';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Parent B denied writing to Child A''s kyc-docs path';
  END;
END $$;

-- ── Case D: anonymous CANNOT write at all = DENY ────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('kyc-docs', 'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000002-1.pdf');
    RAISE EXCEPTION 'FAIL: anon role wrote to kyc-docs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon role denied writing to kyc-docs';
  END;
END $$;

-- ── Case E: existing staff (school_admin) write still works ────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('kyc-docs', 'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000010/eeeeeeee-0000-0000-0000-000000000002-2.pdf');
  RAISE NOTICE 'PASS: school_admin (existing staff workflow) still writes to kyc-docs';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL: school_admin (existing staff workflow) was denied writing to kyc-docs';
END $$;

ROLLBACK;
