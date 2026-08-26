# Parent KYC Document Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent upload KYC documents for their own child from the mobile app, and view/re-download what they uploaded — reusing every existing table, RPC, bucket, and UI pattern; adding only the minimum authorization and UI needed.

**Architecture:** Extend the existing staff-only `upsert_kyc_document()` RPC with a parent-of-subject branch (checked via `student_profiles.parent_profile_id = auth.uid()`, never via client-supplied role/IDs). Add one new INSERT-only storage RLS policy on the existing private `kyc-docs` bucket, scoped the same way. Add parent authorization to the existing web signed-URL route, and add a small new Edge Function (`kyc-signed-url`) so mobile — which cannot reach that Next.js route — gets the same authorized read path via the same bearer-JWT pattern `send-homework-notification` already uses. Convert the existing read-only mobile KYC screen to add upload + view actions, reusing the homework-attachment upload pattern (`expo-document-picker`/`expo-image-picker`/`expo-file-system` → `supabase.storage.upload()` → RPC).

**Tech Stack:** Supabase Postgres (SQL migrations, SECURITY DEFINER RPCs, RLS), Supabase Storage, Supabase Edge Functions (Deno), Next.js App Router (apps/web), Expo/React Native (apps/mobile).

## Global Constraints

- Do not create new tables, RPCs with duplicate purpose, buckets, or document types. Reuse `kyc_documents`, `document_types`, `upsert_kyc_document`, `get_student_kyc_checklist`, bucket `kyc-docs`.
- Authorization for every new code path is based on `student_profiles.parent_profile_id = auth.uid()` — never trust a client-supplied student/school/document ID or role claim alone.
- Preserve all existing staff (`super_admin`/`school_admin`/`principal`) and teacher behavior exactly. No regressions.
- Do not make `kyc-docs` public. Do not add a SELECT storage policy (reads stay locked to signed-URL gates, per the bucket's original design comment). Do not grant parents UPDATE/DELETE on storage objects or on `kyc_documents` rows — least privilege.
- Max file size 5 MB (already enforced by the `kyc_documents.file_size` CHECK constraint). Allowed types: `application/pdf`, `image/jpeg`, `image/png` (matches the existing web admin upload's `.pdf,.jpg,.jpeg,.png` accept-list).
- Parent-uploaded/re-uploaded documents always land in status `submitted`. Parents can never set `verified`/`rejected`. Re-upload reuses the existing `upsert_kyc_document` ON CONFLICT semantics unconditionally (matches existing staff behavior, including resetting an already-verified document back to `submitted` — this is pre-existing behavior, not new).
- Do not touch: admission-enquiry, existing staff KYC dashboard/settings, `verify_documents`/`reject_document`, existing document type seed data, bottom tab / More screen navigation structure beyond wiring the existing KYC entry to the now-interactive screen.
- Final status after implementation remains **FIXED — QA PENDING** until the manual QA checklist (Task 8) is executed and evidence supplied. Do not claim "done" from TypeScript/SQL test results alone.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql` | Adds parent-of-subject branch to `upsert_kyc_document()`; preserves staff branch |
| `supabase/migrations/20260823000001_kyc_documents_file_type_check.sql` | Server-side MIME allowlist CHECK constraint on `kyc_documents.file_type` |
| `supabase/migrations/20260823000002_kyc_docs_parent_upload_policy.sql` | New parent-scoped INSERT policy on `storage.objects` for bucket `kyc-docs` |
| `supabase/tests/kyc_parent_upload_rpc.test.sql` | Security matrix for the RPC change (parent A/B, anon, staff roles preserved) |
| `supabase/tests/kyc_parent_upload_storage.test.sql` | Security matrix for the new storage INSERT policy |
| `apps/web/app/api/kyc/[documentsID]/url/route.ts` | Modify: add parent-of-subject branch to existing staff/teacher authorization |
| `supabase/functions/kyc-signed-url/index.ts` | New: mobile-callable signed-URL endpoint, parent-only, modeled on `send-homework-notification` |
| `apps/mobile/lib/kyc.ts` | Modify: add `uploadKycDocument()` and `getKycSignedUrl()` |
| `apps/mobile/app/(parent)/kyc-documents.tsx` | Modify: add upload (document/photo picker) and view/re-download actions per checklist row |

---

### Task 1: RPC authorization — parent can upload their own child's KYC document

**Files:**
- Create: `supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql`
- Create: `supabase/tests/kyc_parent_upload_rpc.test.sql`

**Interfaces:**
- Consumes: existing `public.upsert_kyc_document(p_subject_id uuid, p_document_type_id uuid, p_file_path text, p_file_name text, p_file_type text, p_file_size integer) RETURNS uuid` (defined in `supabase/migrations/20260803095058_kyc_upsert_rpc.sql`)
- Produces: same signature, same return type, now additionally callable by a parent when `student_profiles.id = p_subject_id AND student_profiles.parent_profile_id = auth.uid()`. Task 4 (mobile lib) calls this RPC by name with these exact parameter names.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/kyc_parent_upload_rpc.test.sql`:

```sql
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
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_rpc.test.sql

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
  SELECT count(*) INTO v_count FROM public.kyc_documents
    WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND subject_id = 'dddddddd-0000-0000-0000-000000000001'
      AND document_type_id = 'eeeeeeee-0000-0000-0000-000000000002';
  SELECT status::text INTO v_status FROM public.kyc_documents WHERE id = v_id;
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_rpc.test.sql`
Expected: Case A raises `FAIL: parent could not upload their own child's KYC document` (or a Postgres `not_authorized` exception surfaces directly), because `upsert_kyc_document` still only checks `get_my_role() IN ('super_admin','school_admin','principal')`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql`:

```sql
-- supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql
--
-- upsert_kyc_document() has been staff-only (super_admin/school_admin/
-- principal) since it was introduced. Rahul approved parents uploading KYC
-- documents for their own child (docs/superpowers/plans/2026-08-19-parent-kyc-upload.md).
-- This adds a parent-of-subject authorization branch alongside the existing
-- staff check, reusing the same student_profiles.parent_profile_id =
-- auth.uid() relationship check already used by get_student_kyc_checklist
-- (20260820000000) and the fees RLS policies (20240001000012). Staff
-- authorization, upsert semantics, resulting status, and audit_log
-- recording are all unchanged.

CREATE OR REPLACE FUNCTION public.upsert_kyc_document(
  p_subject_id uuid, p_document_type_id uuid, p_file_path text,
  p_file_name text, p_file_type text, p_file_size integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_dt_school_id uuid;
  v_id uuid;
  v_is_parent boolean;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_subject_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'invalid_subject'; END IF;

  IF NOT public.feature_enabled(v_school_id, 'kyc_documents') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = p_subject_id AND sp.parent_profile_id = auth.uid()
  ) INTO v_is_parent;

  IF NOT (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') OR v_is_parent) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT school_id INTO v_dt_school_id FROM public.document_types WHERE id = p_document_type_id;
  IF v_dt_school_id IS NULL OR v_dt_school_id <> v_school_id THEN RAISE EXCEPTION 'invalid_document_type'; END IF;

  INSERT INTO public.kyc_documents
    (school_id, subject_type, subject_id, document_type_id, file_path, file_name, file_type, file_size, status, uploaded_by)
  VALUES
    (v_school_id, 'student', p_subject_id, p_document_type_id, p_file_path, p_file_name, p_file_type, p_file_size, 'submitted', auth.uid())
  ON CONFLICT (school_id, subject_type, subject_id, document_type_id) DO UPDATE
    SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name, file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size, status = 'submitted', uploaded_by = auth.uid(),
        verified_by = NULL, verified_at = NULL, rejection_reason = NULL, expires_on = NULL
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'kyc_upload', 'kyc_documents', v_id,
          jsonb_build_object('subject_id', p_subject_id, 'document_type_id', p_document_type_id));

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_kyc_document(uuid, uuid, text, text, text, integer) TO authenticated;
```

Apply it: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql`

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_rpc.test.sql`
Expected: all seven `PASS:` notices, transaction ends with `ROLLBACK` (no output rows persisted).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000000_kyc_parent_upload_authorization.sql supabase/tests/kyc_parent_upload_rpc.test.sql
git commit -m "feat(kyc): allow parent to upload their own child's KYC document via RPC"
```

---

### Task 2: File-type allowlist — server-side backstop

**Files:**
- Create: `supabase/migrations/20260823000001_kyc_documents_file_type_check.sql`

**Interfaces:**
- Consumes: `public.kyc_documents.file_type` column (existing, nullable `text`)
- Produces: a CHECK constraint that any INSERT/UPDATE against `kyc_documents.file_type` must satisfy. Task 1's RPC and the existing web upload flow both write through this column, so both get the same backstop automatically — no code change needed in either.

- [ ] **Step 1: Write the failing test (manual, inline)**

Run this against local Postgres to confirm the constraint doesn't exist yet:

```bash
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "
BEGIN;
INSERT INTO public.document_types (id, school_id, name, is_required, is_active)
VALUES ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Test Type Check', true, true);
INSERT INTO public.kyc_documents (school_id, subject_type, subject_id, document_type_id, file_path, file_name, file_type, file_size, status, uploaded_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'student', 'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000003', 'kyc/x/y/z.exe', 'malware.exe', 'application/x-msdownload', 1000, 'submitted', 'aaaaaaaa-0000-0000-0000-000000000030');
ROLLBACK;
"
```

Expected: `INSERT 0 1` (succeeds — no constraint blocks it yet).

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260823000001_kyc_documents_file_type_check.sql`:

```sql
-- supabase/migrations/20260823000001_kyc_documents_file_type_check.sql
--
-- Server-side backstop restricting kyc_documents.file_type to the same
-- allowlist the existing web admin upload UI already enforces client-side
-- (file input accept=".pdf,.jpg,.jpeg,.png",
-- apps/web/app/(school)/admin/students/[id]/student-documents-tab.tsx:132).
-- Applies uniformly to every caller (staff and the new parent upload path,
-- 20260823000000) since it's a table constraint, not per-RPC logic. NULL is
-- allowed so any row that omits file_type is unaffected.

ALTER TABLE public.kyc_documents
  ADD CONSTRAINT kyc_documents_file_type_check
  CHECK (file_type IS NULL OR file_type IN ('application/pdf', 'image/jpeg', 'image/png'));
```

Apply it: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/migrations/20260823000001_kyc_documents_file_type_check.sql`

- [ ] **Step 3: Run test to verify it passes (i.e., the bad insert is now rejected)**

Run the same inline block from Step 1 again.
Expected: `ERROR: new row for relation "kyc_documents" violates check constraint "kyc_documents_file_type_check"` — the transaction fails and rolls back.

- [ ] **Step 4: Verify existing valid data is unaffected**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "SELECT count(*) FROM public.kyc_documents WHERE file_type IS NOT NULL AND file_type NOT IN ('application/pdf','image/jpeg','image/png');"`
Expected: `0` (no pre-existing rows violate the new constraint; if this returns non-zero, stop and investigate before proceeding — do not force the migration through).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000001_kyc_documents_file_type_check.sql
git commit -m "feat(kyc): restrict kyc_documents.file_type to the existing pdf/jpeg/png allowlist"
```

---

### Task 3: Storage RLS — parent-scoped upload policy on `kyc-docs`

**Files:**
- Create: `supabase/migrations/20260823000002_kyc_docs_parent_upload_policy.sql`
- Create: `supabase/tests/kyc_parent_upload_storage.test.sql`

**Interfaces:**
- Consumes: `storage.objects` table, `storage.foldername(name)` function (built-in Supabase Storage), existing path convention `kyc/{school_id}/{subject_id}/{document_type_id}-{ts}.{ext}` (folder array: `[1]='kyc'`, `[2]=school_id`, `[3]=subject_id`, per the comment in `supabase/migrations/20260803094937_kyc_bucket.sql:5-8`)
- Produces: an additional INSERT policy `kyc_docs_parent_upload`. Task 5 (mobile UI) uploads through `supabase.storage.from("kyc-docs").upload(path, ...)` using this exact path shape, which this policy authorizes.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/kyc_parent_upload_storage.test.sql`:

```sql
-- supabase/tests/kyc_parent_upload_storage.test.sql
--
-- Security test for the parent-scoped INSERT policy on storage.objects for
-- bucket 'kyc-docs' (20260823000002_kyc_docs_parent_upload_policy.sql).
-- Proves a parent can only write under their own child's path segment.
-- Same demo-seed identities as kyc_parent_upload_rpc.test.sql:
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001 (Parent A / Child A)
--   parent aaaaaaaa-...0013 -> student dddddddd-...0010 (Parent B / Child B)
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_storage.test.sql

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
```

Note: `user_roles.school_id`/`role` lookups used by the pre-existing staff policy read `auth.uid()` directly (not the `app.role` GUC — see the comment in `20260803094937_kyc_bucket.sql`), so Case E works because `aaaaaaaa-...0011` already has an active `school_admin` row in the seeded `user_roles` table.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_storage.test.sql`
Expected: Case A raises `FAIL: Parent A was denied writing to their own child's kyc-docs path` (caught as `insufficient_privilege`), because no parent-scoped policy exists yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000002_kyc_docs_parent_upload_policy.sql`:

```sql
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
-- → school at foldername[2], subject at foldername[3].

CREATE POLICY kyc_docs_parent_upload ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-docs' AND EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id::text = (storage.foldername(name))[3]
        AND sp.school_id::text = (storage.foldername(name))[2]
        AND sp.parent_profile_id = auth.uid()
    )
  );
```

Apply it: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/migrations/20260823000002_kyc_docs_parent_upload_policy.sql`

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_storage.test.sql`
Expected: all five `PASS:` notices, ends with `ROLLBACK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000002_kyc_docs_parent_upload_policy.sql supabase/tests/kyc_parent_upload_storage.test.sql
git commit -m "feat(kyc): add parent-scoped storage upload policy for kyc-docs bucket"
```

---

### Task 4: Signed-URL read authorization — web route + new mobile Edge Function

**Files:**
- Modify: `apps/web/app/api/kyc/[documentsID]/url/route.ts`
- Create: `supabase/functions/kyc-signed-url/index.ts`

**Interfaces:**
- Consumes: `kyc_documents(school_id, subject_id, file_path)`, `student_profiles(id, parent_profile_id)` (existing tables)
- Produces: web route unchanged response shape `{ url: string }` / `{ error: string }`. New Edge Function `POST {SUPABASE_URL}/functions/v1/kyc-signed-url` with body `{ documentId: string }`, header `Authorization: Bearer <access_token>`, response `{ url: string }` on success or `{ error: string }` with a 401/403/404/500 status. Task 5 (mobile lib) calls this Edge Function by this exact path and body shape.

**Why a new Edge Function instead of reusing the web route as-is:** `apps/web/lib/supabase/server.ts`'s `createServerSupabaseClient()` reads the session from browser cookies set by Next.js middleware (`x-school-id`/`x-active-role` headers, cookie-domain logic) — it has no bearer-token path, and mobile has no configured URL for the web app at all (`apps/mobile/lib/supabase.ts` only knows the Supabase project URL). Rather than bolt cross-app cookie/header plumbing onto a browser-only route, this reuses the exact bearer-JWT pattern `supabase/functions/send-homework-notification/index.ts` already uses for mobile → Edge Function calls (`apps/mobile/lib/homework.ts:170-181`), keeping mobile inside its one existing calling convention. Both gates enforce the identical authorization check; neither exposes the bucket publicly.

- [ ] **Step 1: Modify the web route — add parent authorization branch**

In `apps/web/app/api/kyc/[documentsID]/url/route.ts`, replace lines 47-55:

```ts
  const roles = await getActiveRoles(supabase, user.id);
  const isSchoolStaff = hasAnyRole(roles, ["school_admin", "principal"], doc.school_id);

  let authorized = isSchoolStaff;
  if (!authorized) {
    const { data: teaches } = await supabase.rpc("teaches_student", { p_student_id: doc.subject_id });
    authorized = !!teaches;
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

with:

```ts
  const roles = await getActiveRoles(supabase, user.id);
  const isSchoolStaff = hasAnyRole(roles, ["school_admin", "principal"], doc.school_id);

  let authorized = isSchoolStaff;
  if (!authorized) {
    const { data: teaches } = await supabase.rpc("teaches_student", { p_student_id: doc.subject_id });
    authorized = !!teaches;
  }
  if (!authorized) {
    const { data: ownChild } = await supabase
      .from("student_profiles")
      .select("id")
      .eq("id", doc.subject_id)
      .eq("parent_profile_id", user.id)
      .maybeSingle();
    authorized = !!ownChild;
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

- [ ] **Step 2: Manually verify the web route change (no automated test harness exists for Next.js API routes in this repo)**

Start the local stack, log in to the web app as parent `aaaaaaaa-0000-0000-0000-000000000030` (Child A's parent), and confirm:

```bash
curl -s "http://localhost:3000/api/kyc/<a-real-document-id-owned-by-child-a>/url" -H "Cookie: <copied-from-browser-devtools>"
```

Expected: `{"url": "https://...signed..."}`. Repeat with a document belonging to a different parent's child — expect `{"error":"Forbidden"}` with status 403. Record both outcomes in Task 8's manual QA evidence.

- [ ] **Step 3: Write the Edge Function**

Create `supabase/functions/kyc-signed-url/index.ts`:

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// Mobile-callable signed-URL endpoint for a parent's own child's KYC
// document. Modeled on send-homework-notification/index.ts's bearer-JWT
// pattern: validate the caller's own JWT with the anon-key client, then use
// the service-role client for the authorized lookup (RLS on kyc_documents
// only grants SELECT of school-scoped rows, not the parent-of-child
// narrowing this endpoint enforces explicitly). Parent-only — staff/teacher
// viewing continues to go through the existing web route.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const callerId = userData.user.id;

  let body: { documentId?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const documentId = body.documentId;
  if (!documentId) return json({ error: "missing_document_id" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: doc } = await admin
    .from("kyc_documents")
    .select("subject_id, file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return json({ error: "not_found" }, 404);

  const { data: ownChild } = await admin
    .from("student_profiles")
    .select("id")
    .eq("id", doc.subject_id)
    .eq("parent_profile_id", callerId)
    .maybeSingle();
  if (!ownChild) return json({ error: "forbidden" }, 403);

  const { data: signed, error: signError } = await admin.storage
    .from("kyc-docs")
    .createSignedUrl(doc.file_path, 60);
  if (signError || !signed) return json({ error: "sign_failed" }, 500);

  return json({ url: signed.signedUrl });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 4: Deploy and manually verify the Edge Function**

Run: `npx supabase functions deploy kyc-signed-url --no-verify-jwt` (matches how the other `send-*` functions in `supabase/functions/` are deployed locally — check `supabase/config.toml` for any per-function `verify_jwt` override before running; if one of the existing `send-*` functions sets it, mirror the same setting here since this function does its own JWT validation in-body).

Then, as Parent A (`aaaaaaaa-...0030`), from a REPL or curl with a real access token:

```bash
curl -s -X POST "http://127.0.0.1:54321/functions/v1/kyc-signed-url" \
  -H "Authorization: Bearer <parent-a-access-token>" -H "Content-Type: application/json" \
  -d '{"documentId":"<a-real-document-id-owned-by-child-a>"}'
```

Expected: `{"url":"..."}`. Repeat with a document belonging to a different parent's child — expect `{"error":"forbidden"}` with status 403. Record both outcomes in Task 8's manual QA evidence.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/kyc/\[documentsID\]/url/route.ts supabase/functions/kyc-signed-url/index.ts
git commit -m "feat(kyc): authorize parent access to KYC document signed URLs (web route + mobile Edge Function)"
```

---

### Task 5: Mobile data layer — upload and signed-URL functions

**Files:**
- Modify: `apps/mobile/lib/kyc.ts`

**Interfaces:**
- Consumes: `supabase.rpc("upsert_kyc_document", {...})` (Task 1), `supabase.storage.from("kyc-docs").upload(...)` (Task 3's policy), `${supabaseUrl}/functions/v1/kyc-signed-url` (Task 4)
- Produces:
  - `uploadKycDocument(schoolId: string, studentId: string, documentTypeId: string, file: { uri: string; name: string; mimeType: string; size: number }): Promise<{ error: string | null }>`
  - `getKycSignedUrl(documentId: string): Promise<{ url: string | null; error: string | null }>`

  Both are consumed by Task 6 (`kyc-documents.tsx`).

- [ ] **Step 1: Add the two functions to `apps/mobile/lib/kyc.ts`**

Add this import at the top (alongside the existing `import { supabase } from "./supabase";`):

```ts
import { File } from "expo-file-system";
import { supabase, supabaseUrl } from "./supabase";
```

Append to the end of `apps/mobile/lib/kyc.ts`:

```ts
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Upload one picked file as the KYC document for (studentId, documentTypeId)
 * and register it via upsert_kyc_document. Mirrors uploadAttachment() in
 * lib/homework.ts. On storage-upload success but RPC failure, the orphaned
 * storage object is left in place (matches the existing web admin upload's
 * handleFileSelected behavior — it doesn't clean up on RPC failure either;
 * the error is surfaced to the user either way, never silently reported as
 * success).
 */
export async function uploadKycDocument(
  schoolId: string,
  studentId: string,
  documentTypeId: string,
  file: PickedFile,
): Promise<{ error: string | null }> {
  if (file.size > MAX_FILE_SIZE) return { error: "File exceeds 5MB." };
  if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    return { error: "Unsupported file type. Use PDF, JPG, or PNG." };
  }

  const ext = file.name.split(".").pop() || "bin";
  const path = `kyc/${schoolId}/${studentId}/${documentTypeId}-${Date.now()}.${ext}`;
  const bytes = await new File(file.uri).bytes();

  const up = await supabase.storage
    .from("kyc-docs")
    .upload(path, bytes, { contentType: file.mimeType, upsert: false });
  if (up.error) return { error: up.error.message };

  const { error: rpcErr } = await supabase.rpc("upsert_kyc_document", {
    p_subject_id: studentId,
    p_document_type_id: documentTypeId,
    p_file_path: path,
    p_file_name: file.name,
    p_file_type: file.mimeType,
    p_file_size: file.size,
  });
  if (rpcErr) return { error: rpcErr.message };

  return { error: null };
}

/** Signed URL for a parent's own child's KYC document, via the kyc-signed-url Edge Function. */
export async function getKycSignedUrl(documentId: string): Promise<{ url: string | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { url: null, error: "Not authenticated" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/kyc-signed-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error ?? "Could not open document" };
    return { url: data.url as string, error: null };
  } catch {
    return { url: null, error: "Network error" };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors from `lib/kyc.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/kyc.ts
git commit -m "feat(kyc): add mobile upload and signed-URL data-layer functions"
```

---

### Task 6: Mobile UI — upload and view actions on the KYC checklist screen

**Files:**
- Modify: `apps/mobile/app/(parent)/kyc-documents.tsx`

**Interfaces:**
- Consumes: `uploadKycDocument`, `getKycSignedUrl`, `PickedFile` (Task 5); `SCHOOL_ID` from `../../lib/supabase` (existing export, used since this mobile build is single-school per `apps/mobile/lib/active-context.tsx:95-106`, which already scopes all parent/student queries to `SCHOOL_ID`)
- Produces: none (leaf screen)

- [ ] **Step 1: Add imports**

In `apps/mobile/app/(parent)/kyc-documents.tsx`, replace the import block (lines 1-11) with:

```tsx
// apps/mobile/app/(parent)/kyc-documents.tsx
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import { SCHOOL_ID } from "../../lib/supabase";
import { SkeletonCard } from "../../components/Skeleton";
import { loadKycChecklist, uploadKycDocument, getKycSignedUrl, type KycChecklistItem, type KycState, type PickedFile } from "../../lib/kyc";
```

- [ ] **Step 2: Add upload/view handlers inside `KycDocumentsScreen`**

After the existing `onRefresh` function (currently ending at line 62) and before the `return (` (line 64), add:

```tsx
  const [busyDocTypeId, setBusyDocTypeId] = useState<string | null>(null);

  async function handlePicked(documentTypeId: string, file: PickedFile) {
    if (!studentId) return;
    setBusyDocTypeId(documentTypeId);
    const { error } = await uploadKycDocument(SCHOOL_ID, studentId, documentTypeId, file);
    setBusyDocTypeId(null);
    if (error) {
      Alert.alert("Upload failed", error);
      return;
    }
    await load(studentId);
  }

  async function pickDocument(documentTypeId: string) {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.size ?? 0) > 5 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 5MB."); return; }
    await handlePicked(documentTypeId, {
      uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/pdf", size: a.size ?? 0,
    });
  }

  async function pickImage(documentTypeId: string) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > 5 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 5MB."); return; }
    const name = a.fileName ?? `photo-${Date.now()}.jpg`;
    await handlePicked(documentTypeId, {
      uri: a.uri, name, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize ?? 0,
    });
  }

  async function viewDocument(documentId: string) {
    const { url, error } = await getKycSignedUrl(documentId);
    if (error || !url) {
      Alert.alert("Could not open document", error ?? "Unknown error");
      return;
    }
    await Linking.openURL(url);
  }
```

- [ ] **Step 3: Wire the actions into each checklist card**

Replace the rejection-reason block and the closing of the item card (currently lines 148-155):

```tsx
              {item.isRejected && item.rejectionReason && (
                <View style={{ backgroundColor: theme.danger + "12", borderRadius: 8, padding: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>
                    Rejected: "{item.rejectionReason}" — please provide this document again at the school office.
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
```

with:

```tsx
              {item.isRejected && item.rejectionReason && (
                <View style={{ backgroundColor: theme.danger + "12", borderRadius: 8, padding: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>
                    Rejected: "{item.rejectionReason}"
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                {busyDocTypeId === item.documentTypeId ? (
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10 }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textMuted }}>Uploading…</Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => pickDocument(item.documentTypeId)}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}
                    >
                      <Ionicons name="document-outline" size={16} color={theme.primary} />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>
                        {item.fileName ? "Replace (PDF)" : "Upload PDF"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => pickImage(item.documentTypeId)}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}
                    >
                      <Ionicons name="image-outline" size={16} color={theme.primary} />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>
                        {item.fileName ? "Replace (Photo)" : "Upload Photo"}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {item.fileName && item.state !== "missing" && (
                <TouchableOpacity
                  onPress={() => viewDocument((item as any).documentId)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
                >
                  <Ionicons name="eye-outline" size={14} color={theme.info} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.info }}>View document</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
```

`viewDocument` needs the underlying `kyc_documents.id` (`document_id` in the RPC's return shape), which `KycChecklistItem` doesn't currently expose — fix that in Step 4 rather than casting through `any` in the final version.

- [ ] **Step 4: Expose `documentId` on `KycChecklistItem`**

In `apps/mobile/lib/kyc.ts`, add `documentId: string | null;` to the `KycChecklistItem` interface (after `documentTypeId: string;`) and `documentId: r.document_id,` to the `items` mapping inside `loadKycChecklist`. Then in `kyc-documents.tsx`, replace `(item as any).documentId` from Step 3 with `item.documentId!` (the surrounding `item.fileName && item.state !== "missing"` guard already ensures it's non-null).

- [ ] **Step 5: Update the footer banner**

Replace the read-only footer banner (lines 159-164):

```tsx
        <View style={{ flexDirection: "row", gap: 10, backgroundColor: theme.info + "12", borderRadius: 12, padding: 14, marginTop: 4 }}>
          <Ionicons name="information-circle-outline" size={18} color={theme.info} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 18 }}>
            This is a status view only. To submit or update a document, please visit the school office.
          </Text>
        </View>
```

with:

```tsx
        <View style={{ flexDirection: "row", gap: 10, backgroundColor: theme.info + "12", borderRadius: 12, padding: 14, marginTop: 4 }}>
          <Ionicons name="information-circle-outline" size={18} color={theme.info} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 18 }}>
            Upload a PDF or photo (max 5MB) for each document. Uploaded documents are reviewed by the school office.
          </Text>
        </View>
```

- [ ] **Step 6: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors from `app/(parent)/kyc-documents.tsx` or `lib/kyc.ts`.

- [ ] **Step 7: Lint**

Run: `cd apps/mobile && npx eslint app/(parent)/kyc-documents.tsx lib/kyc.ts`
Expected: no new errors (existing lint config's pre-existing warnings, if any, unrelated to this diff are acceptable — do not introduce new ones).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/\(parent\)/kyc-documents.tsx apps/mobile/lib/kyc.ts
git commit -m "feat(kyc): add upload and view actions to the mobile parent KYC screen"
```

---

### Task 7: Regression pass

**Files:** none (verification only)

- [ ] **Step 1: Re-run both new SQL security test files**

```bash
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_rpc.test.sql
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_storage.test.sql
```
Expected: all `PASS:` notices, no `FAIL:` exceptions, both end in `ROLLBACK`.

- [ ] **Step 2: Re-run the pre-existing KYC checklist authorization test to confirm no regression**

```bash
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_checklist_authorization.test.sql
```
Expected: identical output to before this plan's changes (all `PASS:` notices) — this file wasn't touched, but it's the closest existing coverage of the read path this plan's changes sit next to.

- [ ] **Step 3: Confirm existing staff KYC upload/verify/reject still work end-to-end (web)**

Log in to the web app as `school_admin` (`aaaaaaaa-...0011`), open a student's Documents tab, upload a file, click Verify on a `submitted` row, and reject another. Confirm the toasts, status badges, and `verify_documents`/`reject_document` RPCs all behave exactly as before (Task 1/2 only added a parent branch and a NULL-permissive CHECK constraint — neither should change any staff-facing behavior).

- [ ] **Step 4: Confirm admission-enquiry and unrelated mobile screens are untouched**

```bash
git status
git diff --stat
```
Expected: only the files listed in this plan's File Structure table appear as modified/created. No changes under `apps/mobile/app/(parent)/admission-enquiry.tsx`, `apps/mobile/lib/admissions.ts`, `apps/mobile/lib/kyc.ts`'s `KycState`/`deriveState`/`loadKycChecklist` logic (only additive changes), bottom-tab config, or the More screen's navigation entries.

- [ ] **Step 5: Commit (only if any fixes were needed in this task)**

```bash
git add -A
git commit -m "test(kyc): confirm parent upload changes introduce no regressions"
```

---

### Task 8: Manual QA (required before declaring done)

**Files:** none (verification only). Do not skip — per this plan's Global Constraints, status stays `FIXED — QA PENDING` until every row below has a recorded PASS/FAIL, not an assumption.

- [ ] **Step 1: Run through the full parent workflow on a device/emulator**

Using demo parent `aaaaaaaa-...0030` (Child A) and demo parent `aaaaaaaa-...0013` (Child B), verify and record PASS/FAIL for each:

1. Parent logs in.
2. Parent opens More → KYC Documents.
3. Correct active child is shown.
4. Existing checklist renders (document types, required/optional badges, statuses).
5. Parent taps Upload PDF on a document type, picks a file ≤5MB → succeeds, status becomes "Awaiting review" (`submitted`).
6. Parent taps Upload Photo on a different document type → succeeds.
7. Parent taps "View document" on an uploaded item → opens the signed URL and displays the file.
8. Parent A cannot see or reach Child B's documents (switch active child if the parent has multiple children with access, or confirm via Task 4/Edge Function manual tests that a foreign `documentId` is rejected).
9. Parent picks an oversized file (>5MB) → rejected client-side with an alert, no upload attempted.
10. Parent picks an unsupported file type (e.g. a `.docx`) via the PDF picker's type filter (should be unselectable) — if reachable via a different OS file picker path, confirm the server-side CHECK constraint (Task 2) still rejects it and the RPC error is surfaced, not swallowed.
11. Turn off network mid-upload → error is shown, no false "success" state.
12. Existing verified/expired/expiring status rendering (colors, labels, expiry text) is visually unchanged for document types not touched in this test.
13. More screen navigation and bottom tabs are unchanged apart from KYC Documents now being interactive.
14. Logout, then log back in as the same parent → state is consistent, no crash.
15. Force-quit and reopen the app → KYC screen still loads correctly, previously uploaded documents still show as submitted/verified.

- [ ] **Step 2: Record evidence**

For each numbered item above, write PASS / FAIL / NOT TESTED next to it (never silently convert NOT TESTED to PASS). Attach screenshots or screen recordings where practical.

- [ ] **Step 3: Produce the final evidence report**

List, separately:
1. Exact files changed (from Task 7 Step 4's `git diff --stat`).
2. Exact SQL migrations (the three new files).
3. Exact RPC authorization change (Task 1 diff).
4. Exact storage policy (Task 3 migration).
5. Exact signed-URL authorization changes (Task 4 web route diff + new Edge Function).
6. TypeScript result (Task 5 Step 2, Task 6 Step 6).
7. Lint result (Task 6 Step 7).
8. SQL security test results (Task 7 Steps 1-2, full output).
9. Regression test results (Task 7 Steps 3-4).
10. Manual QA checklist (Task 8 Step 1, filled in).
11. Known failures, if any.
12. Remaining blockers, if any.

Final status: **FIXED — QA PENDING** until Step 2's checklist is fully filled with real PASS/FAIL results from an actual device/emulator run, at which point it becomes **FIXED** only if every item is PASS.

---

## Self-Review Notes

- **Spec coverage:** Every numbered requirement in the original spec (sections 1-17) maps to a task above: existing-system reuse (Tasks 1-6, no new tables/RPCs/buckets), parent workflow (Tasks 5-6), security model (Tasks 1, 3, 4), RPC change + 7-case test matrix (Task 1), storage RLS (Task 3), no update/delete for parents (Task 3's policy is INSERT-only, explicitly noted), signed-URL access (Task 4), mobile implementation (Tasks 5-6), file validation (Tasks 2, 5, 6), document-type rules (unchanged — reused as-is), status behavior (`submitted` only, enforced by the RPC itself — unchanged), re-upload/replacement (verified via Task 1's re-upload test case), RLS/security tests (Tasks 1, 3), regression tests (Task 7), migration safety (additive-only migrations, no historical file touched), manual QA (Task 8), evidence (Task 8 Step 3).
- **Deviation flagged:** Task 4 adds a new Edge Function not named in the original spec, because the named web route is architecturally unreachable from mobile (cookie-only auth, no mobile-to-web URL config exists). The web route itself is still patched exactly as specified. Rationale and precedent are documented inline in Task 4.
- **Placeholder scan:** No TBD/TODO markers; every step has runnable code or an exact command with expected output.
- **Type consistency:** `PickedFile` (Task 5) is used identically in Task 6's `handlePicked`. `KycChecklistItem.documentId` (added in Task 6 Step 4) is consumed by `viewDocument` in Task 6 Step 3 without an `any` cast in the final state. `uploadKycDocument`/`getKycSignedUrl` signatures match between Task 5's definition and Task 6's call sites.
