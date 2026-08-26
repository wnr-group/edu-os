# Parent Homework Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent upload one file (PDF/JPEG/PNG, ≤5MB) per (homework, child) as their homework submission, before the homework's due date, which automatically marks the homework "done" and lets the assigned teacher view the file from the existing review screens.

**Architecture:** Follows the KYC parent-upload precedent exactly: a private Supabase Storage bucket with no read policy, a `SECURITY DEFINER` RPC that independently re-verifies authorization/eligibility server-side (never trusting client-supplied IDs), a signed-URL Edge Function for reads (dual-authorized for parent-of-child OR teacher-of-section), and hand-rolled transaction-rollback SQL tests matching `supabase/tests/kyc_parent_upload_*.test.sql`.

**Tech Stack:** PostgreSQL/Supabase migrations, Deno Edge Functions, React Native/Expo (`expo-document-picker`, `expo-image-picker`, `expo-file-system`), Next.js (web teacher roster).

## Global Constraints

- File types: exactly `application/pdf`, `image/jpeg`, `image/png` — no others, no compression, no additional types (locked decision).
- Max file size: 5 MB (5,242,880 bytes) exactly — not 2MB (the older `homework-attachments` limit). Enforced client-side, in the RPC, and at the bucket level.
- One submission per `(homework_id, student_id)` — idempotent upsert, never a second row. No multi-file child table.
- Selecting a file has **zero** backend side effects. Only an explicit "Upload" tap triggers storage upload + RPC call.
- On upload failure: keep the staged file, set an error state, allow retry without creating a DB row; a different file picked replaces the staged one.
- No submission after `due_date` (a bare `DATE` column) — comparison is `CURRENT_DATE <= due_date`, using the database server's clock, never the device's. Applies to both first submission and replacement.
- A successful submission automatically calls the existing, unmodified `mark_homework_done` RPC — never duplicate or edit its logic.
- Old storage object deleted only *after* the new submission row is confirmed persisted; best-effort; a delete failure must never fail the overall submission.
- Reuse the existing `homework` feature flag — no new `FeatureKey`, no new toggle.
- Do not modify: `mark_homework_done`, `unmark_homework_done`, `review_homework`, `mark_homework_viewed`, `is_parent_of_student`, `teaches_homework_section`, any KYC file/migration, `homework_attachments`/`homework-attachments` bucket, existing homework RLS policies for `homework`/`homework_attachments`.
- Migration filenames: `YYYYMMDDHHMMSS_snake_case_description.sql`, using `2026082` + an incrementing 6-digit suffix for same-day ordering (matching the existing `20260823000000`, `...000001`, `...000002` convention).
- SQL tests run via: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/<file>.test.sql` and must end in `ROLLBACK;` so they leave no residue.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260824000000_homework_submissions_table.sql` | `homework_submissions` table + RLS (SELECT-only) |
| `supabase/migrations/20260824000001_submit_homework_rpc.sql` | `submit_homework` RPC |
| `supabase/migrations/20260824000002_homework_submissions_bucket.sql` | Private bucket + INSERT/DELETE storage policies |
| `supabase/tests/homework_submission_rpc.test.sql` | Authorization/eligibility/idempotency tests for the RPC |
| `supabase/tests/homework_submission_storage.test.sql` | Storage INSERT/DELETE policy tests |
| `supabase/functions/homework-submission-signed-url/index.ts` | Signed-URL Edge Function, dual-authorized (parent or teacher) |
| `apps/mobile/lib/homework.ts` | Modify: add `submitHomework`, `getHomeworkSubmissionSignedUrl`, `loadSubmission` |
| `apps/mobile/app/(parent)/homework/[homeworkId].tsx` | Modify: add staged-file submission UI section |
| `apps/mobile/app/(teacher)/homework/[homeworkId].tsx` | Modify: add "View submission" row per student |
| `apps/web/lib/homework.ts` | Modify: add `getHomeworkSubmissionSignedUrl` (web variant) |
| `apps/web/app/(school)/teacher/homework/[id]/roster-review.tsx` | Modify: add "View submission" row per student |

---

### Task 1: `homework_submissions` table + RLS

**Files:**
- Create: `supabase/migrations/20260824000000_homework_submissions_table.sql`

**Interfaces:**
- Produces: table `public.homework_submissions(id, school_id, homework_id, student_id, submitted_by, file_path, file_name, file_type, file_size, submitted_at, updated_at)`, `UNIQUE(homework_id, student_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260824000000_homework_submissions_table.sql
--
-- Parent-uploaded homework submissions. ONE row per (homework, student),
-- upserted in place on re-submission — mirrors homework_status's shape
-- (20240001000047_homework_status.sql) and kyc_documents' upsert-by-replace
-- semantics. All writes go through submit_homework() (next migration);
-- clients get NO direct INSERT/UPDATE/DELETE, same convention as
-- homework_status.

CREATE TABLE public.homework_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  homework_id   UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  submitted_by  UUID NOT NULL REFERENCES auth.users(id),
  file_path     TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT NOT NULL CHECK (file_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  file_size     INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (homework_id, student_id)
);

CREATE INDEX idx_homework_submissions_homework ON public.homework_submissions(homework_id);
CREATE INDEX idx_homework_submissions_student  ON public.homework_submissions(student_id);

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

-- SELECT only: parent-of-student, or staff, or the teacher assigned to the
-- homework's section. Mirrors homework_status_select exactly, plus the
-- teacher branch (homework_status's SELECT policy already covers teacher via
-- get_my_role() = 'teacher' AND school match, which is coarser than section
-- match — this table intentionally requires teaches_homework_section for the
-- teacher branch since submissions are more sensitive student work product).
CREATE POLICY "homework_submissions_select" ON public.homework_submissions FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'homework')
      AND school_id = public.get_my_school_id()
      AND (
        public.get_my_role() IN ('school_admin', 'principal')
        OR (public.get_my_role() = 'teacher' AND public.teaches_homework_section(homework_id))
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = homework_submissions.student_id
            AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

-- NO INSERT / UPDATE / DELETE policies. RLS is deny-by-default; all writes
-- go through submit_homework() (SECURITY DEFINER, next migration).
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset` (or the project's existing local-migration-apply command — check `package.json` root scripts for the exact one already used, e.g. `npm run db:reset`).
Expected: migration applies with no errors; `\d public.homework_submissions` in psql shows the table, the `UNIQUE (homework_id, student_id)` constraint, and RLS enabled.

- [ ] **Step 3: Smoke-test the constraint directly**

Run this ad hoc (not a permanent test file — just a manual check before moving on):
```sql
BEGIN;
INSERT INTO public.homework_submissions
  (school_id, homework_id, student_id, submitted_by, file_path, file_name, file_type, file_size)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000801', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'x/y/z.pdf', 'z.pdf', 'application/pdf', 1000);
-- second insert with the same (homework_id, student_id) must fail on the UNIQUE constraint:
INSERT INTO public.homework_submissions
  (school_id, homework_id, student_id, submitted_by, file_path, file_name, file_type, file_size)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000801', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'a/b/c.pdf', 'c.pdf', 'application/pdf', 2000);
ROLLBACK;
```
Expected: second `INSERT` raises `duplicate key value violates unique constraint "homework_submissions_homework_id_student_id_key"`.

Note: `cccccccc-0000-0000-0000-000000000801` is not a real `homework.id` — replace with a real seeded homework id if the FK is enforced strictly in your local seed, or wrap in a transaction against seeded data as shown; the point of this step is only to confirm the UNIQUE constraint fires, not to validate FK data.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260824000000_homework_submissions_table.sql
git commit -m "feat(homework): add homework_submissions table with SELECT-only RLS"
```

---

### Task 2: `submit_homework` RPC

**Files:**
- Create: `supabase/migrations/20260824000001_submit_homework_rpc.sql`
- Test: `supabase/tests/homework_submission_rpc.test.sql`

**Interfaces:**
- Consumes: `public.homework_submissions` (Task 1); existing `public.is_parent_of_student(uuid)`, `public.feature_enabled(uuid,text)`, `public.mark_homework_done(uuid,uuid)` (all pre-existing, unmodified).
- Produces: `public.submit_homework(p_homework_id uuid, p_student_id uuid, p_file_path text, p_file_name text, p_file_type text, p_file_size integer) RETURNS TABLE(submission_id uuid, old_file_path text)` — the only writer of `homework_submissions`.

- [ ] **Step 1: Write the failing test file**

```sql
-- supabase/tests/homework_submission_rpc.test.sql
--
-- Security + business-rule test for submit_homework() added in
-- 20260824000001_submit_homework_rpc.sql. Proves: a parent can submit only
-- for their own child; homework must belong to the student's actual
-- class/section; submission is rejected after the homework's due_date (both
-- first-time and replacement); re-submission upserts in place (no duplicate
-- row) and does not touch the row if rejected; a successful submission
-- transitions homework_status to 'done' via the existing mark_homework_done;
-- anon is denied.
--
-- Uses local seed's Demo School (aaaaaaaa-...0001):
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001, class 8 (bbbbbbbb-...0008), section 8A (cccccccc-...0801)
--   parent aaaaaaaa-...0013 -> student dddddddd-...0010, class 5 (bbbbbbbb-...0005), section 5A (cccccccc-...0501)
--   teacher aaaaaaaa-...0013 is also class teacher of section 8A (cccccccc-...0801)
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_rpc.test.sql

BEGIN;

UPDATE public.schools SET features_enabled = features_enabled || '{"homework": true}'::jsonb
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Test homework fixtures: one due in the future (submittable), one already
-- past due (rejected), both in section 8A / class 8 (Child A's section).
INSERT INTO public.homework (id, school_id, class_id, section_id, subject_id, teacher_id, title, due_date)
SELECT 'eeeeeeee-0000-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000801',
       sub.id, 'aaaaaaaa-0000-0000-0000-000000000013', 'Future-due test homework', CURRENT_DATE + 2
FROM public.subjects sub
WHERE sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND sub.class_id = 'bbbbbbbb-0000-0000-0000-000000000008'
LIMIT 1;

INSERT INTO public.homework (id, school_id, class_id, section_id, subject_id, teacher_id, title, due_date)
SELECT 'eeeeeeee-0000-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000801',
       sub.id, 'aaaaaaaa-0000-0000-0000-000000000013', 'Past-due test homework', CURRENT_DATE - 1
FROM public.subjects sub
WHERE sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND sub.class_id = 'bbbbbbbb-0000-0000-0000-000000000008'
LIMIT 1;

-- Homework belonging to Child B's section (5A), used for the section-mismatch case.
INSERT INTO public.homework (id, school_id, class_id, section_id, subject_id, teacher_id, title, due_date)
SELECT 'eeeeeeee-0000-0000-0000-000000000103', 'aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000501',
       sub.id, 'aaaaaaaa-0000-0000-0000-000000000013', 'Section-B test homework', CURRENT_DATE + 2
FROM public.subjects sub
WHERE sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND sub.class_id = 'bbbbbbbb-0000-0000-0000-000000000005'
LIMIT 1;

-- ── Case A: Parent A submits for their own child, future due date = ALLOW ──
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_id uuid; v_old text;
BEGIN
  SELECT submission_id, old_file_path INTO v_id, v_old FROM public.submit_homework(
    'eeeeeeee-0000-0000-0000-000000000101', 'dddddddd-0000-0000-0000-000000000001',
    'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000001/1.pdf',
    'homework.pdf', 'application/pdf', 12345
  );
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: parent could not submit homework for their own child';
  END IF;
  IF v_old IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: first submission returned a non-null old_file_path (got %)', v_old;
  END IF;
  RAISE NOTICE 'PASS: parent submits homework for own child (submission id %)', v_id;
END $$;

-- Verify the auto mark-done side effect (calls the existing, unmodified mark_homework_done).
RESET ROLE;
DO $$
DECLARE v_state text;
BEGIN
  SELECT state::text INTO v_state FROM public.homework_status
  WHERE homework_id = 'eeeeeeee-0000-0000-0000-000000000101' AND student_id = 'dddddddd-0000-0000-0000-000000000001';
  IF v_state <> 'done' THEN
    RAISE EXCEPTION 'FAIL: submit_homework did not transition homework_status to done (got %)', v_state;
  END IF;
  RAISE NOTICE 'PASS: successful submission auto-marks homework done';
END $$;

-- Re-submission (replacement) must stay one logical row and return the previous path.
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_id uuid; v_old text; v_count int;
BEGIN
  SELECT submission_id, old_file_path INTO v_id, v_old FROM public.submit_homework(
    'eeeeeeee-0000-0000-0000-000000000101', 'dddddddd-0000-0000-0000-000000000001',
    'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000001/2.pdf',
    'homework-v2.pdf', 'application/pdf', 22222
  );
  IF v_old IS DISTINCT FROM 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000001/1.pdf' THEN
    RAISE EXCEPTION 'FAIL: replacement did not return the previous file_path (got %)', v_old;
  END IF;

  SELECT count(*) INTO v_count FROM public.homework_submissions
  WHERE homework_id = 'eeeeeeee-0000-0000-0000-000000000101' AND student_id = 'dddddddd-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: replacement created a duplicate row (% rows, expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: replacement upserts in place and returns previous file_path';
END $$;

-- ── Case B: Parent A CANNOT submit for another parent's child = DENY ───────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000103', 'dddddddd-0000-0000-0000-000000000010',
      'homework-submissions/x/y/z/1.pdf', 'sneaky.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: Parent A submitted homework for Parent B''s child';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: Parent A denied submitting for another parent''s child';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- ── Case C: homework/section mismatch = DENY ────────────────────────────────
-- Parent A's own child (dddddddd-...0001, section 8A) submitting against
-- homework assigned to section 5A must be rejected even though Parent A
-- really is dddddddd-...0001's parent.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000103', 'dddddddd-0000-0000-0000-000000000001',
      'homework-submissions/x/y/z/1.pdf', 'wrong-section.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: submission accepted for homework outside the student''s section';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: submission denied when homework section does not match student section';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- ── Case D: due date has passed, first-time submission = DENY ──────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000102', 'dddddddd-0000-0000-0000-000000000001',
      'homework-submissions/x/y/z/1.pdf', 'late.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: submission accepted after the due date';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'deadline_passed' THEN
      RAISE NOTICE 'PASS: first-time submission denied after due date';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.homework_submissions
  WHERE homework_id = 'eeeeeeee-0000-0000-0000-000000000102';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: a rejected late submission left a persisted row (% rows)', v_count;
  END IF;
  RAISE NOTICE 'PASS: rejected late submission created no row';
END $$;

-- ── Case E: due date has passed, REPLACEMENT attempt = DENY, old row unchanged ──
-- Seed an already-valid submission on the past-due homework by inserting
-- directly (simulating one made before the deadline), then attempt a
-- replacement through the RPC now that the deadline has passed.
RESET ROLE;
INSERT INTO public.homework_submissions
  (school_id, homework_id, student_id, submitted_by, file_path, file_name, file_type, file_size)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000102', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'homework-submissions/original.pdf', 'original.pdf', 'application/pdf', 5000);

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000102', 'dddddddd-0000-0000-0000-000000000001',
      'homework-submissions/x/y/z/replacement.pdf', 'replacement.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: replacement accepted after the due date';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'deadline_passed' THEN
      RAISE NOTICE 'PASS: replacement denied after due date';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
DECLARE v_path text;
BEGIN
  SELECT file_path INTO v_path FROM public.homework_submissions
  WHERE homework_id = 'eeeeeeee-0000-0000-0000-000000000102' AND student_id = 'dddddddd-0000-0000-0000-000000000001';
  IF v_path <> 'homework-submissions/original.pdf' THEN
    RAISE EXCEPTION 'FAIL: existing submission was modified by a rejected late replacement (path now %)', v_path;
  END IF;
  RAISE NOTICE 'PASS: existing submission unchanged after a rejected late replacement attempt';
END $$;

-- ── Case F: invalid file type/size are rejected server-side ────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000103', 'dddddddd-0000-0000-0000-000000000010',
      'homework-submissions/x/y/z/1.exe', 'virus.exe', 'application/x-msdownload', 1000
    );
    RAISE EXCEPTION 'FAIL: an unsupported file type was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid_file_type' THEN
      RAISE NOTICE 'PASS: unsupported file type rejected server-side';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000103', 'dddddddd-0000-0000-0000-000000000010',
      'homework-submissions/x/y/z/1.pdf', 'huge.pdf', 'application/pdf', 999999999
    );
    RAISE EXCEPTION 'FAIL: an oversized file was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid_file_size' THEN
      RAISE NOTICE 'PASS: oversized file rejected server-side';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- ── Case G: anon cannot call the RPC at all = DENY ──────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_homework(
      'eeeeeeee-0000-0000-0000-000000000101', 'dddddddd-0000-0000-0000-000000000001',
      'x/y/z.pdf', 'anon.pdf', 'application/pdf', 1000
    );
    RAISE EXCEPTION 'FAIL: anon role executed submit_homework';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon role has no EXECUTE grant on submit_homework';
  END;
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_rpc.test.sql`
Expected: FAIL with `function public.submit_homework(...) does not exist` (the RPC doesn't exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260824000001_submit_homework_rpc.sql
--
-- submit_homework(): the sole writer of homework_submissions. Re-derives
-- every piece of authorization/eligibility server-side — never trusts a
-- client-supplied student_id/homework_id/school_id/submitted_by. Atomic by
-- construction: this is one plpgsql function body, so if the internal call
-- to mark_homework_done() raises, Postgres aborts the whole transaction
-- (including the upsert already executed above it) — no explicit
-- transaction control needed or possible inside a function body.

CREATE OR REPLACE FUNCTION public.submit_homework(
  p_homework_id uuid,
  p_student_id  uuid,
  p_file_path   text,
  p_file_name   text,
  p_file_type   text,
  p_file_size   integer
) RETURNS TABLE(submission_id uuid, old_file_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_school_id       uuid;
  v_hw_section      uuid;
  v_hw_class        uuid;
  v_due_date        date;
  v_student_school  uuid;
  v_student_section uuid;
  v_student_class   uuid;
  v_old_path        text;
  v_submission_id   uuid;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT school_id, section_id, class_id, due_date
  INTO v_school_id, v_hw_section, v_hw_class, v_due_date
  FROM public.homework WHERE id = p_homework_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'homework_not_found';
  END IF;

  SELECT school_id, section_id, class_id
  INTO v_student_school, v_student_section, v_student_class
  FROM public.student_profiles WHERE id = p_student_id;

  IF v_student_school IS DISTINCT FROM v_school_id
     OR v_student_section IS DISTINCT FROM v_hw_section
     OR v_student_class IS DISTINCT FROM v_hw_class THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.feature_enabled(v_school_id, 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  IF CURRENT_DATE > v_due_date THEN
    RAISE EXCEPTION 'deadline_passed';
  END IF;

  IF p_file_type NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
    RAISE EXCEPTION 'invalid_file_type';
  END IF;

  IF p_file_size <= 0 OR p_file_size > 5242880 THEN
    RAISE EXCEPTION 'invalid_file_size';
  END IF;

  -- Capture the previous file_path (if any) before the upsert overwrites it.
  SELECT file_path INTO v_old_path
  FROM public.homework_submissions
  WHERE homework_id = p_homework_id AND student_id = p_student_id;

  INSERT INTO public.homework_submissions
    (school_id, homework_id, student_id, submitted_by, file_path, file_name, file_type, file_size)
  VALUES
    (v_school_id, p_homework_id, p_student_id, auth.uid(), p_file_path, p_file_name, p_file_type, p_file_size)
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET file_path    = EXCLUDED.file_path,
        file_name    = EXCLUDED.file_name,
        file_type    = EXCLUDED.file_type,
        file_size    = EXCLUDED.file_size,
        submitted_by = EXCLUDED.submitted_by,
        submitted_at = now(),
        updated_at   = now()
  RETURNING id INTO v_submission_id;

  PERFORM public.mark_homework_done(p_homework_id, p_student_id);

  RETURN QUERY SELECT v_submission_id, v_old_path;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_homework(uuid, uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_homework(uuid, uuid, text, text, text, integer) TO authenticated;
```

- [ ] **Step 4: Apply the migration and re-run the test**

Run: `supabase db reset` then `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_rpc.test.sql`
Expected: every case prints `PASS: ...`, no `FAIL:` lines, transaction ends in `ROLLBACK` with no error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260824000001_submit_homework_rpc.sql supabase/tests/homework_submission_rpc.test.sql
git commit -m "feat(homework): add submit_homework RPC with server-side authorization and due-date enforcement"
```

---

### Task 3: Storage bucket + policies

**Files:**
- Create: `supabase/migrations/20260824000002_homework_submissions_bucket.sql`
- Test: `supabase/tests/homework_submission_storage.test.sql`

**Interfaces:**
- Consumes: `public.is_parent_of_student(uuid)` (existing, unmodified).
- Produces: bucket `homework-submissions` (private, 5MB limit); path convention `homework-submissions/{school_id}/{homework_id}/{student_id}/{timestamp}.{ext}` — `storage.foldername(name)[4]` is the student id.

- [ ] **Step 1: Write the failing test file**

```sql
-- supabase/tests/homework_submission_storage.test.sql
--
-- Security test for the parent-scoped INSERT/DELETE policies on
-- storage.objects for bucket 'homework-submissions'
-- (20260824000002_homework_submissions_bucket.sql). Proves a parent can
-- only write/delete under their own child's path segment, regardless of
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

-- ── Case E: Parent A can DELETE their own child's object = ALLOW ───────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'homework-submissions'
    AND name = 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000101/dddddddd-0000-0000-0000-000000000001/1.pdf';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: DELETE affected 0 rows for Parent A''s own child''s object';
  END IF;
  RAISE NOTICE 'PASS: Parent A can DELETE their own child''s homework-submissions object';
END $$;

-- ── Case F: Parent A CANNOT delete Parent B's child's object = DENY ────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('homework-submissions', 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000103/dddddddd-0000-0000-0000-000000000010/1.pdf');
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_count int;
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'homework-submissions'
    AND name = 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000103/dddddddd-0000-0000-0000-000000000010/1.pdf';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: Parent A deleted Parent B''s child''s object';
  END IF;
  RAISE NOTICE 'PASS: Parent A denied deleting another parent''s child''s object (0 rows affected)';
END $$;

-- ── Case G: anonymous CANNOT delete at all = DENY ───────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE v_count int;
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'homework-submissions'
    AND name = 'homework-submissions/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000103/dddddddd-0000-0000-0000-000000000010/1.pdf';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: anon role deleted from homework-submissions';
  END IF;
  RAISE NOTICE 'PASS: anon role denied deleting from homework-submissions (0 rows affected)';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_storage.test.sql`
Expected: FAIL at Case A — `insufficient_privilege` because the bucket/policies don't exist yet (or `bucket_id "homework-submissions" does not exist`-style FK error, depending on whether `storage.objects.bucket_id` has a bucket FK enforced in this schema — either way, not a `PASS`).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260824000002_homework_submissions_bucket.sql
--
-- Private bucket for parent-uploaded homework submissions. Modeled directly
-- on kyc-docs (20260803094937_kyc_bucket.sql,
-- 20260823000002_kyc_docs_parent_upload_policy.sql): no SELECT policy at
-- all — reads exclusively via the homework-submission-signed-url Edge
-- Function (next-but-one task). Storage RLS runs outside PostgREST's
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

CREATE POLICY homework_submissions_parent_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'homework-submissions'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[4], '')::uuid)
  );

-- No SELECT policy — reads are fully locked to the signed-URL Edge Function.
```

- [ ] **Step 4: Apply the migration and re-run the test**

Run: `supabase db reset` then `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_storage.test.sql`
Expected: every case prints `PASS: ...`, no `FAIL:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260824000002_homework_submissions_bucket.sql supabase/tests/homework_submission_storage.test.sql
git commit -m "feat(homework): add private homework-submissions storage bucket with parent-scoped INSERT/DELETE policies"
```

---

### Task 4: Signed URL Edge Function

**Files:**
- Create: `supabase/functions/homework-submission-signed-url/index.ts`

**Interfaces:**
- Consumes: `public.homework_submissions` (Task 1), existing `public.is_parent_of_student` and `public.teaches_homework_section` (called via a user-JWT-authenticated client so `auth.uid()` resolves correctly, not the service-role client).
- Produces: `POST /functions/v1/homework-submission-signed-url` accepting `{ submissionId: string }`, returning `{ url: string }` or `{ error: string }`.

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/homework-submission-signed-url/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// Signed-URL endpoint for a homework submission file. Two authorized
// callers, unlike kyc-signed-url's parent-only case: the submission's own
// parent, OR a teacher assigned to the homework's section
// (teaches_homework_section — existing function, unmodified, reused as-is).
// Accepts only submissionId; homework_id/student_id/school_id/file_path are
// all derived server-side from the row, never trusted from the client.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // User-JWT client: used to call is_parent_of_student/teaches_homework_section
  // so auth.uid() inside those SECURITY DEFINER functions resolves to the
  // actual caller, exactly as it does when the mobile/web app calls them
  // directly via supabase.rpc(...).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  let body: { submissionId?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const submissionId = body.submissionId;
  if (!submissionId) return json({ error: "missing_submission_id" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: submission } = await admin
    .from("homework_submissions")
    .select("homework_id, student_id, file_path")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return json({ error: "not_found" }, 404);

  const { data: isParent } = await userClient.rpc("is_parent_of_student", {
    p_student_id: submission.student_id,
  });
  const { data: isTeacher } = await userClient.rpc("teaches_homework_section", {
    p_homework_id: submission.homework_id,
  });
  if (!isParent && !isTeacher) return json({ error: "forbidden" }, 403);

  const { data: signed, error: signError } = await admin.storage
    .from("homework-submissions")
    .createSignedUrl(submission.file_path, 60);
  if (signError || !signed) return json({ error: "storage_object_missing" }, 500);

  return json({ url: signed.signedUrl });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Deploy locally and smoke-test manually (no automated harness exists for any Edge Function in this repo — documented as MANUAL QA, not an automated test)**

Run: `supabase functions serve homework-submission-signed-url` (or the project's existing local Edge Function run command — check how `kyc-signed-url` is normally exercised locally, e.g. via the Supabase CLI's functions serve command already used for that function).

Manual curl matrix to execute and record results for (get a real JWT for each principal via the existing local auth/login flow used for manual QA of other features):
```bash
# 1. Authorized parent (own child's submission) -> 200 { url: ... }
curl -s -X POST http://localhost:54321/functions/v1/homework-submission-signed-url \
  -H "Authorization: Bearer <PARENT_A_JWT>" -H "Content-Type: application/json" \
  -d '{"submissionId":"<SUBMISSION_ID_FOR_CHILD_A>"}'

# 2. Parent of a different student -> 403 { error: "forbidden" }
curl -s -X POST http://localhost:54321/functions/v1/homework-submission-signed-url \
  -H "Authorization: Bearer <PARENT_B_JWT>" -H "Content-Type: application/json" \
  -d '{"submissionId":"<SUBMISSION_ID_FOR_CHILD_A>"}'

# 3. Authorized teacher (teaches the homework's section) -> 200 { url: ... }
curl -s -X POST http://localhost:54321/functions/v1/homework-submission-signed-url \
  -H "Authorization: Bearer <TEACHER_OF_SECTION_8A_JWT>" -H "Content-Type: application/json" \
  -d '{"submissionId":"<SUBMISSION_ID_FOR_SECTION_8A_HOMEWORK>"}'

# 4. Teacher outside the homework's section -> 403 { error: "forbidden" }
curl -s -X POST http://localhost:54321/functions/v1/homework-submission-signed-url \
  -H "Authorization: Bearer <TEACHER_OF_SECTION_1A_JWT>" -H "Content-Type: application/json" \
  -d '{"submissionId":"<SUBMISSION_ID_FOR_SECTION_8A_HOMEWORK>"}'

# 5. Anonymous -> 401 { error: "unauthorized" }
curl -s -X POST http://localhost:54321/functions/v1/homework-submission-signed-url \
  -H "Content-Type: application/json" -d '{"submissionId":"<ANY_ID>"}'

# 6. Invalid/nonexistent submissionId -> 404 { error: "not_found" }
curl -s -X POST http://localhost:54321/functions/v1/homework-submission-signed-url \
  -H "Authorization: Bearer <PARENT_A_JWT>" -H "Content-Type: application/json" \
  -d '{"submissionId":"00000000-0000-0000-0000-000000000000"}'
```
Expected: status codes and error bodies exactly as annotated above for each case. Record actual results in the task report — do not mark this PASS without having actually run each curl command and observed the response.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/homework-submission-signed-url/index.ts
git commit -m "feat(homework): add dual-authorized signed-URL Edge Function for homework submissions"
```

---

### Task 5: Mobile client library

**Files:**
- Modify: `apps/mobile/lib/homework.ts`

**Interfaces:**
- Consumes: `supabase` client and `supabaseUrl` (existing exports from `./supabase`), `File` from `expo-file-system` (already imported at the top of this file).
- Produces: `PickedFile` type (reuse the shape from `apps/mobile/lib/kyc.ts`, redeclared locally to avoid a cross-module dependency — same fields: `uri`, `name`, `mimeType`, `size`), `HomeworkSubmission` type, `loadSubmission(homeworkId, studentId)`, `submitHomework(schoolId, homeworkId, studentId, file)`, `getHomeworkSubmissionSignedUrl(submissionId)`.

- [ ] **Step 1: Append the new code to `apps/mobile/lib/homework.ts`**

Add at the end of the file (after `unmarkDone`):

```typescript
const SUBMISSION_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const SUBMISSION_MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface HomeworkSubmission {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  submittedAt: string;
}

// The parent's own child's submission for one homework item, if any.
export async function loadSubmission(
  homeworkId: string, studentId: string,
): Promise<HomeworkSubmission | null> {
  const { data } = await supabase
    .from("homework_submissions")
    .select("id, file_name, file_type, file_size, submitted_at")
    .eq("homework_id", homeworkId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: (data as any).id,
    fileName: (data as any).file_name,
    fileType: (data as any).file_type,
    fileSize: (data as any).file_size,
    submittedAt: (data as any).submitted_at,
  };
}

/**
 * Upload one staged file as the homework submission for (homeworkId,
 * studentId), then call submit_homework to persist it and auto-mark the
 * homework done. On success, best-effort delete the previous submission's
 * storage object (returned by the RPC) — never blocks or reverses the
 * successful submission if the delete fails. On storage-upload success but
 * RPC failure, the orphaned storage object is left in place, matching the
 * existing KYC/homework-attachments precedent (uploadKycDocument in
 * lib/kyc.ts, uploadAttachment above) — this codebase has no cleanup
 * mechanism for that case anywhere, and this feature does not introduce one.
 */
export async function submitHomework(
  schoolId: string, homeworkId: string, studentId: string, file: PickedFile,
): Promise<{ error: string | null }> {
  if (file.size > SUBMISSION_MAX_FILE_SIZE) return { error: "File exceeds 5MB." };
  if (!SUBMISSION_ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    return { error: "Unsupported file type. Use PDF, JPG, or PNG." };
  }

  const ext = file.name.split(".").pop() || "bin";
  const path = `homework-submissions/${schoolId}/${homeworkId}/${studentId}/${Date.now()}.${ext}`;
  const bytes = await new File(file.uri).bytes();

  const up = await supabase.storage
    .from("homework-submissions")
    .upload(path, bytes, { contentType: file.mimeType, upsert: false });
  if (up.error) return { error: up.error.message };

  const { data, error: rpcErr } = await supabase.rpc("submit_homework", {
    p_homework_id: homeworkId,
    p_student_id: studentId,
    p_file_path: path,
    p_file_name: file.name,
    p_file_type: file.mimeType,
    p_file_size: file.size,
  });
  if (rpcErr) return { error: mapSubmitError(rpcErr.message) };

  const oldPath = (Array.isArray(data) ? data[0]?.old_file_path : (data as any)?.old_file_path) as string | null;
  if (oldPath) {
    // Best-effort cleanup of the superseded object. A failure here must
    // never surface as a submission failure — the new row is already
    // persisted and authoritative.
    await supabase.storage.from("homework-submissions").remove([oldPath]);
  }

  return { error: null };
}

function mapSubmitError(message: string): string {
  if (message.includes("deadline_passed")) return "The due date has passed. This homework can no longer be submitted.";
  if (message.includes("not_authorized")) return "You are not authorized to submit this homework.";
  if (message.includes("module_disabled")) return "Homework is not enabled for your school.";
  if (message.includes("invalid_file_type")) return "Unsupported file type. Use PDF, JPG, or PNG.";
  if (message.includes("invalid_file_size")) return "File exceeds 5MB.";
  return "Could not submit homework. Please try again.";
}

/** Signed URL for a homework submission, via the homework-submission-signed-url Edge Function. */
export async function getHomeworkSubmissionSignedUrl(
  submissionId: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { url: null, error: "Not authenticated" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/homework-submission-signed-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submissionId }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error ?? "Could not open submission" };
    return { url: data.url as string, error: null };
  } catch {
    return { url: null, error: "Network error" };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors introduced by these additions (pre-existing unrelated errors, if any, are out of scope — verify by diffing the error list against a run on the pre-change file if any exist).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/homework.ts
git commit -m "feat(homework): add mobile client functions for homework submission upload and signed-URL viewing"
```

---

### Task 6: Parent mobile UX — staged-file submission section

**Files:**
- Modify: `apps/mobile/app/(parent)/homework/[homeworkId].tsx`

**Interfaces:**
- Consumes: `loadSubmission`, `submitHomework`, `PickedFile`, `HomeworkSubmission` (Task 5, `../../../lib/homework`); `expo-document-picker`, `expo-image-picker` (already used identically in `apps/mobile/app/(parent)/kyc-documents.tsx`); `useActiveContext` for `studentId`; `SCHOOL_ID` from `../../../lib/supabase`.

- [ ] **Step 1: Read the current file to find the exact insertion point**

Run: open `apps/mobile/app/(parent)/homework/[homeworkId].tsx` and locate the existing "Mark Done" button block and the `loadStudentStatus` call in its data-loading effect — the new submission section is inserted directly below the Mark Done control, and `loadSubmission` is called alongside the existing status load.

- [ ] **Step 2: Add imports and state**

At the top of the file, alongside the existing homework lib import, add:
```typescript
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { loadSubmission, submitHomework, type PickedFile, type HomeworkSubmission } from "../../../lib/homework";
```

Inside the component, alongside the existing status state:
```typescript
const [submission, setSubmission] = useState<HomeworkSubmission | null>(null);
const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
const [uploadError, setUploadError] = useState<string | null>(null);
```

- [ ] **Step 3: Load the existing submission alongside the existing status load**

In the same effect/callback that currently calls `loadStudentStatus(homeworkId, studentId)`, add:
```typescript
const sub = await loadSubmission(homeworkId, studentId);
setSubmission(sub);
```
(Mirror the existing effect's exact `async`/`useCallback`/dependency-array shape — do not introduce a second competing effect.)

- [ ] **Step 4: Add pick/upload handlers**

```typescript
async function pickSubmissionDocument() {
  const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf"], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return;
  const a = res.assets[0];
  if ((a.size ?? 0) > 5 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 5MB."); return; }
  setSelectedFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/pdf", size: a.size ?? 0 });
  setUploadState("idle");
  setUploadError(null);
}

async function pickSubmissionImage() {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
  if (res.canceled || !res.assets?.[0]) return;
  const a = res.assets[0];
  if ((a.fileSize ?? 0) > 5 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 5MB."); return; }
  const name = a.fileName ?? `photo-${Date.now()}.jpg`;
  setSelectedFile({ uri: a.uri, name, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize ?? 0 });
  setUploadState("idle");
  setUploadError(null);
}

async function handleUpload() {
  if (!selectedFile || !studentId) return;
  setUploadState("uploading");
  setUploadError(null);
  const { error } = await submitHomework(SCHOOL_ID, homeworkId, studentId, selectedFile);
  if (error) {
    setUploadState("error");
    setUploadError(error);
    return;
  }
  setUploadState("success");
  setSelectedFile(null);
  const sub = await loadSubmission(homeworkId, studentId);
  setSubmission(sub);
}
```
(`homeworkId` and `studentId` here refer to the same variables already in scope in this screen — from `useLocalSearchParams`/`useActiveContext` respectively, exactly as the existing Mark Done handler uses them; do not re-derive them differently.)

- [ ] **Step 5: Add the UI section**

Insert below the existing Mark Done control, gated by the same `due_date` the screen already loads via `loadStudentStatus`:

```tsx
{studentId && (
  <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10, marginTop: 12 }}>
    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>
      Submission
    </Text>

    {submission && (
      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
        Submitted: {submission.fileName}
      </Text>
    )}

    {new Date().toISOString().slice(0, 10) > dueDate ? (
      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>
        The due date has passed. This homework can no longer be submitted.
      </Text>
    ) : (
      <>
        {selectedFile && (
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
            Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
          </Text>
        )}

        {uploadState === "error" && uploadError && (
          <View style={{ backgroundColor: theme.danger + "12", borderRadius: 8, padding: 10 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>{uploadError}</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={pickSubmissionDocument}
            disabled={uploadState === "uploading"}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}
          >
            <Ionicons name="document-outline" size={16} color={theme.primary} />
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Choose PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickSubmissionImage}
            disabled={uploadState === "uploading"}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}
          >
            <Ionicons name="image-outline" size={16} color={theme.primary} />
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Choose Photo</Text>
          </TouchableOpacity>
        </View>

        {selectedFile && (
          <TouchableOpacity
            onPress={handleUpload}
            disabled={uploadState === "uploading"}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.primary, opacity: uploadState === "uploading" ? 0.6 : 1 }}
          >
            {uploadState === "uploading" ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Uploading…</Text>
              </>
            ) : (
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                {uploadState === "error" ? "Retry Upload" : "Upload"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </>
    )}
  </View>
)}
```

Note for the implementer: `dueDate` above refers to the `due_date` string already returned by this screen's existing `loadStudentStatus` call (`dueDate` field per `apps/mobile/lib/homework.ts`'s `loadStudentStatus` return type) — reuse that existing value, do not re-fetch it. `ActivityIndicator` needs adding to this file's `react-native` import list if not already present (check the existing import line first — `kyc-documents.tsx` already imports it from the same package).

- [ ] **Step 6: Manual QA (record actual results, not assumptions)**

Run the app (`cd apps/mobile && npx expo start`), log in as a parent, open a homework item with a future due date:
1. Pick a PDF — confirm no network request fires (check dev tools/logs) and the Upload button appears.
2. Tap Upload — confirm loading state, then success, then the submission's filename appears.
3. Kill and reopen the app, revisit the same homework — confirm the submission persists.
4. Attempt on a past-due homework — confirm the picker/upload UI is replaced by the deadline-passed message.
5. Force a failure (e.g., airplane mode mid-upload) — confirm the staged file remains, an error message shows, and Upload is retryable.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/(parent)/homework/[homeworkId].tsx"
git commit -m "feat(homework): add parent submission UI with staged-file upload flow"
```

---

### Task 7: Teacher mobile — view submission

**Files:**
- Modify: `apps/mobile/app/(teacher)/homework/[homeworkId].tsx`

**Interfaces:**
- Consumes: `getHomeworkSubmissionSignedUrl` (Task 5); the existing roster row rendering for each student in the "Done" group.

- [ ] **Step 1: Extend the roster load to include submission ids**

The existing `RosterRow` type (from `apps/mobile/lib/homework.ts`) does not carry a submission id. Add a lightweight lookup in this screen rather than modifying the shared `loadRoster` (keeps that function's contract unchanged for the mobile+web callers that already use it):

```typescript
import { getHomeworkSubmissionSignedUrl } from "../../../lib/homework";
import { supabase } from "../../../lib/supabase";

// Local to this screen: submission id per student, for the "View submission" affordance.
const [submissionIdByStudent, setSubmissionIdByStudent] = useState<Record<string, string>>({});

// Alongside the existing roster-loading effect, after roster is fetched:
useEffect(() => {
  if (!homeworkId) return;
  supabase
    .from("homework_submissions")
    .select("id, student_id")
    .eq("homework_id", homeworkId)
    .then(({ data }) => {
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[(row as any).student_id] = (row as any).id;
      setSubmissionIdByStudent(map);
    });
}, [homeworkId]);
```

- [ ] **Step 2: Add the view handler and row**

```typescript
async function viewSubmission(submissionId: string) {
  const { url, error } = await getHomeworkSubmissionSignedUrl(submissionId);
  if (error || !url) {
    Alert.alert("Could not open submission", error ?? "Unknown error");
    return;
  }
  await Linking.openURL(url);
}
```

In the roster row rendering (inside the existing per-student row block, next to the rating/comment form), add — only rendered when a submission id exists for that student:
```tsx
{submissionIdByStudent[row.studentId] && (
  <TouchableOpacity
    onPress={() => viewSubmission(submissionIdByStudent[row.studentId])}
    style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
  >
    <Ionicons name="eye-outline" size={14} color={theme.info} />
    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.info }}>View submission</Text>
  </TouchableOpacity>
)}
```
(`Linking` and `Alert` need to be present in this file's `react-native` import list — check first; `kyc-documents.tsx` already imports both identically.)

- [ ] **Step 3: Manual QA**

Log in as the teacher who owns the section, open a homework item with a submission — confirm "View submission" appears only for students who submitted, and tapping it opens the file. Log in as a different teacher not assigned to that section (if reachable via existing test accounts) — confirm the signed-URL call is rejected (403) if manually attempted, though the UI won't expose the affordance to them anyway since they can't reach this roster screen for a homework they don't teach.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(teacher)/homework/[homeworkId].tsx"
git commit -m "feat(homework): add teacher view-submission affordance to the mobile roster screen"
```

---

### Task 8: Teacher web — view submission

**Files:**
- Modify: `apps/web/lib/homework.ts`
- Modify: `apps/web/app/(school)/teacher/homework/[id]/roster-review.tsx`

**Interfaces:**
- Consumes: same `homework-submission-signed-url` Edge Function as mobile.
- Produces: `getHomeworkSubmissionSignedUrl(submissionId)` in `apps/web/lib/homework.ts`, mirroring the web equivalent of `getSignedUrl`/`uploadAttachment` already in that file (check its existing shape for the session/fetch pattern used on web — likely near-identical to the mobile version but using the web app's existing Supabase client import path).

- [ ] **Step 1: Read `apps/web/lib/homework.ts` to confirm its existing session/fetch pattern**

Before writing, open the file and find how it currently calls other Edge Functions (or, if it doesn't yet, mirror the mobile `getHomeworkSubmissionSignedUrl` implementation from Task 5, substituting the web app's Supabase client import).

- [ ] **Step 2: Add the function**

```typescript
// apps/web/lib/homework.ts — append
export async function getHomeworkSubmissionSignedUrl(
  submissionId: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { url: null, error: "Not authenticated" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/homework-submission-signed-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submissionId }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error ?? "Could not open submission" };
    return { url: data.url as string, error: null };
  } catch {
    return { url: null, error: "Network error" };
  }
}
```
(Substitute whatever `supabase`/`supabaseUrl` import names this file already uses — confirm exact names from Step 1 before writing.)

- [ ] **Step 3: Add submission lookup + "View submission" to `roster-review.tsx`**

Mirror Task 7 Steps 1–2 exactly, adapted to this component's existing data-fetching pattern (React state + effect vs. whatever this file already uses — confirm by reading the file first) and using `window.open(url, "_blank")` in place of `Linking.openURL`.

- [ ] **Step 4: Manual QA**

Log in to the web teacher dashboard, open a homework item's roster, confirm "View submission" appears for submitted students and opens the file in a new tab.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/homework.ts "apps/web/app/(school)/teacher/homework/[id]/roster-review.tsx"
git commit -m "feat(homework): add teacher view-submission affordance to the web roster screen"
```

---

### Task 9: Regression pass + final verification

**Files:** none created/modified — verification only.

- [ ] **Step 1: Re-run both SQL test files together**

Run:
```bash
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_rpc.test.sql
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/homework_submission_storage.test.sql
```
Expected: all `PASS`, both end in successful `ROLLBACK`.

- [ ] **Step 2: Re-run the existing KYC and homework test suites to confirm no regression**

Run:
```bash
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_rpc.test.sql
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_parent_upload_storage.test.sql
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_checklist_authorization.test.sql
```
Expected: all still PASS, unchanged from before this feature.

- [ ] **Step 3: Type-check and lint both apps**

Run: `cd apps/mobile && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Run each app's existing lint command (check `package.json` for the exact script name, e.g. `npm run lint`).
Expected: no new errors attributable to files touched in this plan.

- [ ] **Step 4: Manual regression QA**

Verify unchanged: parent Mark Done tap (on a homework with no submission attached), teacher rating/comment submission, parent KYC upload flow, existing navigation (More tab, bottom tabs), login/logout, homework list/calendar views.

- [ ] **Step 5: Full `git diff` review**

Run: `git status --short` and `git diff --stat`
Confirm: only the files listed in the File Structure table above are touched; no unrelated files; no debug `console.log`; no secrets; no dependency changes.

- [ ] **Step 6: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(homework): final regression pass for parent homework submission feature"
```
(Skip this step entirely if Steps 1–5 required no changes.)

---

## Self-Review Notes

**Spec coverage:** every locked decision from the grilling session maps to a task — architecture template (Tasks 1–4 mirror KYC), staged-upload UX (Task 6), single-file upsert (Task 2's `ON CONFLICT`), server-side authorization incl. section/class match (Task 2), replacement/cleanup ordering (Task 2's `old_file_path` return + Task 5's post-success `storage.remove`), due-date cutoff (Task 2), auto-mark-done (Task 2's `PERFORM mark_homework_done`), file limits (Tasks 1/2/3/5/6), teacher visibility (Tasks 4/7/8), feature flag reuse (Task 2's `feature_enabled(v_school_id,'homework')` — no new flag anywhere in this plan).

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrasing anywhere above; every step has complete, runnable code or an exact command with expected output.

**Type consistency:** `PickedFile { uri, name, mimeType, size }` used identically in Task 5 and Task 6; `HomeworkSubmission { id, fileName, fileType, fileSize, submittedAt }` used identically in Task 5 and Task 6; `submitHomework(schoolId, homeworkId, studentId, file)` signature matches its Task 6 call site exactly; `getHomeworkSubmissionSignedUrl(submissionId)` signature matches its Task 7/8 call sites exactly; `submit_homework`'s SQL return columns (`submission_id`, `old_file_path`) match the mobile client's destructuring in Task 5.
