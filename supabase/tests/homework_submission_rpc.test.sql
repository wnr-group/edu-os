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
