-- supabase/tests/kyc_parent_upload_rpc.test.sql
--
-- Security + regression test for the upsert_kyc_document() parent-upload
-- authorization added in 20260823000000_kyc_parent_upload_authorization.sql.
-- Proves a parent can upload only their own child's KYC document, an
-- unrelated parent is denied, anon is denied, and existing staff behavior
-- (school_admin/principal/super_admin) is unchanged. Teacher stays denied
-- (teachers were never authorized to upload — no change there).
--
-- Uses local seed's Demo School (aaaaaaaa-...0001):
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001 (Parent A / Child A)
--   parent aaaaaaaa-...0013 -> student dddddddd-...0010 (Parent B / Child B; also class teacher of 8A)
--   school_admin aaaaaaaa-...0011
--   principal    aaaaaaaa-...0012
--   super_admin  aaaaaaaa-...0010
-- Run: npx supabase db query --local -f supabase/tests/kyc_parent_upload_rpc.test.sql

BEGIN;

INSERT INTO public.document_types (id, school_id, name, is_required, is_active)
VALUES ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Test Address Proof', true, true);

UPDATE public.schools SET features_enabled = features_enabled || '{"kyc_documents": true}'::jsonb
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ── Case A: Parent A uploads for their own child = ALLOW ───────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_id uuid;
BEGIN
  SELECT public.upsert_kyc_document(
    'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002',
    'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000002-1.pdf',
    'address-proof.pdf', 'application/pdf', 12345
  ) INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: parent could not upload their own child''s KYC document';
  END IF;
  RAISE NOTICE 'PASS: parent uploads own child''s KYC document (id %)', v_id;
END $$;

-- Re-upload (replace) must stay one logical row, status reset to submitted.
DO $$
DECLARE v_id uuid; v_count int; v_status text;
BEGIN
  SELECT public.upsert_kyc_document(
    'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002',
    'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000002-2.pdf',
    'address-proof-v2.pdf', 'application/pdf', 22222
  ) INTO v_id;
  -- Verify as a role that can bypass RLS or has SELECT on kyc_documents
END $$;

RESET ROLE;
DO $$
DECLARE v_count int; v_status text;
BEGIN
  SELECT count(*) INTO v_count FROM public.kyc_documents
    WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND subject_id = 'dddddddd-0000-0000-0000-000000000001'
      AND document_type_id = 'eeeeeeee-0000-0000-0000-000000000002';
  
  SELECT status::text INTO v_status FROM public.kyc_documents 
    WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND subject_id = 'dddddddd-0000-0000-0000-000000000001'
      AND document_type_id = 'eeeeeeee-0000-0000-0000-000000000002';
  
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: re-upload created a duplicate row (% rows, expected 1)', v_count;
  END IF;
  IF v_status <> 'submitted' THEN
    RAISE EXCEPTION 'FAIL: re-upload did not reset status to submitted (got %)', v_status;
  END IF;
  RAISE NOTICE 'PASS: re-upload replaces in place (1 row), status reset to submitted';
END $$;

-- ── Case B: Parent A CANNOT upload for another parent's child = DENY ───────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.upsert_kyc_document(
      'dddddddd-0000-0000-0000-000000000010', 'eeeeeeee-0000-0000-0000-000000000002',
      'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000010/eeeeeeee-0000-0000-0000-000000000002-1.pdf',
      'sneaky.pdf', 'application/pdf', 12345
    );
    RAISE EXCEPTION 'FAIL: Parent A uploaded a document for Parent B''s child';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: Parent A denied uploading for another parent''s child';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- ── Case C: Anonymous CANNOT call the RPC at all = DENY ────────────────────
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.upsert_kyc_document(
      'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002',
      'kyc/x/y/z.pdf', 'anon.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: anon role executed upsert_kyc_document';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon role has no EXECUTE grant on upsert_kyc_document';
  END;
END $$;

-- ── Case D: existing school_admin behavior preserved = ALLOW ───────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

DO $$
DECLARE v_id uuid;
BEGIN
  SELECT public.upsert_kyc_document(
    'dddddddd-0000-0000-0000-000000000010', 'eeeeeeee-0000-0000-0000-000000000002',
    'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000010/eeeeeeee-0000-0000-0000-000000000002-1.pdf',
    'staff-upload.pdf', 'application/pdf', 12345
  ) INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: school_admin (existing staff workflow) could not upload';
  END IF;
  RAISE NOTICE 'PASS: school_admin (existing staff workflow) still uploads (id %)', v_id;
END $$;

-- ── Case E: existing principal behavior preserved = ALLOW ──────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000012"}', true);

DO $$
DECLARE v_id uuid;
BEGIN
  SELECT public.upsert_kyc_document(
    'dddddddd-0000-0000-0000-000000000010', 'eeeeeeee-0000-0000-0000-000000000002',
    'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000010/eeeeeeee-0000-0000-0000-000000000002-2.pdf',
    'principal-upload.pdf', 'application/pdf', 12345
  ) INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: principal (existing staff workflow) could not upload';
  END IF;
  RAISE NOTICE 'PASS: principal (existing staff workflow) still uploads (id %)', v_id;
END $$;

-- ── Case F: existing super_admin behavior preserved = ALLOW ────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000010"}', true);

DO $$
DECLARE v_id uuid;
BEGIN
  SELECT public.upsert_kyc_document(
    'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002',
    'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000002-3.pdf',
    'superadmin-upload.pdf', 'application/pdf', 12345
  ) INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: super_admin (existing staff workflow) could not upload';
  END IF;
  RAISE NOTICE 'PASS: super_admin (existing staff workflow) still uploads (id %)', v_id;
END $$;

-- ── Case G: teacher remains DENIED (unchanged — never authorized) ──────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
BEGIN
  BEGIN
    -- aaaaaaaa-...0013 is a teacher AND a parent, but not of dddddddd-...0001.
    PERFORM public.upsert_kyc_document(
      'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002',
      'kyc/x/y/z.pdf', 'teacher.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: teacher (not a staff role, not this child''s parent) uploaded a document';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: teacher-only caller denied (unchanged pre-existing behavior)';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

ROLLBACK;
