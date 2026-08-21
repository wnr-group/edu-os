-- supabase/tests/kyc_checklist_authorization.test.sql
--
-- Security + regression test for the get_student_kyc_checklist RPC hardening
-- (migration 20260820000000_kyc_checklist_authorization.sql). Proves the RPC
-- now enforces caller authorization instead of returning any student's data
-- to any authenticated caller, while staff/teacher access keeps working.
-- Uses local seed's Demo School (aaaaaaaa-...0001):
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001 (Aryan Sharma, Class 8A)
--   parent aaaaaaaa-...0013 (also class teacher of Class 8A / Aryan's section)
--     -> his own children dddddddd-...0010 (Aarav, Class 5A) / dddddddd-...0011 (Diya, Class 8A)
--   school_admin aaaaaaaa-...0011
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_checklist_authorization.test.sql

BEGIN;

-- Seed one required document type (school-wide) and one submitted document
-- for Aryan Sharma so the checklist has a real row to assert against.
-- Inserted as the superuser connection (before any role switch) since
-- neither table has an INSERT policy for any client role — all real writes
-- go through the SECURITY DEFINER KYC RPCs.
INSERT INTO public.document_types (id, school_id, name, is_required, is_active)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Test Birth Certificate', true, true);

-- Enable the feature for the demo school so the check passes
UPDATE public.schools SET features_enabled = features_enabled || '{"kyc_documents": true}'::jsonb WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

INSERT INTO public.kyc_documents (id, school_id, subject_type, subject_id, document_type_id, file_path, file_name, file_size, status, uploaded_by)
VALUES (
  'ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'student',
  'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
  'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000001-1.pdf',
  'birth-cert.pdf', 12345, 'submitted', 'aaaaaaaa-0000-0000-0000-000000000030'
);

-- ── Case 1: the correct parent CAN read their own child's checklist ────────
-- Filters the RPC result to the row this test itself seeded (by
-- document_type_id) rather than asserting a total row count: real usage of
-- the school's KYC admin dashboard legitimately seeds additional
-- document_types for this school outside this test's control (e.g. the
-- standard seed_document_types() defaults), so a raw count(*) would go
-- stale as soon as that happens. Scoping to our own seeded document type
-- keeps the assertion exact and independent of that unrelated data.
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001')
    WHERE document_type_id = 'eeeeeeee-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: parent could not read their own child''s checklist, got % rows for the seeded document type (expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: parent reads own child''s checklist (1 row for the seeded document type)';
END $$;

-- ── Case 2: an unrelated, non-staff parent CANNOT read another child's checklist ──
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_count int;
BEGIN
  -- aaaaaaaa-...0030 is not dddddddd-...0010's parent and holds no teacher role.
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000010');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: unrelated parent could read another child''s checklist, got % rows (expected 0)', v_count;
  END IF;
  RAISE NOTICE 'PASS: unrelated parent is denied (0 rows)';
END $$;

-- ── Case 3: unauthenticated/anon caller CANNOT execute the function at all ─
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'FAIL: anon role executed get_student_kyc_checklist and got % rows (expected permission denied)', v_count;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon role has no EXECUTE grant on get_student_kyc_checklist';
END $$;

-- ── Case 4: existing staff access (school_admin) keeps working ─────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001')
    WHERE document_type_id = 'eeeeeeee-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: school_admin could not read a student''s checklist, got % rows for the seeded document type (expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: school_admin (existing staff workflow) still reads the checklist (1 row for the seeded document type)';
END $$;

-- ── Case 5: existing teacher-of-the-student access keeps working ───────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE v_count int;
BEGIN
  -- aaaaaaaa-...0013 is the class teacher of Aryan Sharma's section.
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001')
    WHERE document_type_id = 'eeeeeeee-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: teacher-of-the-student could not read the checklist, got % rows for the seeded document type (expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: teacher-of-the-student still reads the checklist (1 row for the seeded document type)';
END $$;

ROLLBACK;
