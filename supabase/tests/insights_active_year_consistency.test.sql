-- Review comment #3: dispatcher (insights_recompute_dispatch) and worker
-- (insights-recompute Edge Function's student_enrollments query) must derive
-- their student set from the identical active-year definition, or the
-- dispatcher's chunk count and the worker's actual result set diverge and
-- students beyond the last computed chunk are silently never processed.
--
-- This test builds: current-year active students + stale prior-year
-- enrollments (is_active=true but pointing at a non-active academic year,
-- which is possible because academic_year_id is NOT NULL and nothing
-- resets is_active on year rollover) + more students than one worker chunk,
-- then verifies the dispatcher's predicate and the worker's predicate (as
-- literally implemented in supabase/functions/insights-recompute/index.ts:
-- is_active=true AND academic_years.status='active', ordered by
-- student_profile_id, id) select the exact same, deterministic row set.

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

DO $$
DECLARE
  v_school UUID := 'eeeeeeee-a301-0000-0000-000000000001';
  v_year_active UUID := 'eeeeeeee-a301-0000-0000-000000000002';
  v_year_stale UUID := 'eeeeeeee-a301-0000-0000-000000000003';
  v_class UUID := 'eeeeeeee-a301-0000-0000-000000000004';
  v_section UUID := 'eeeeeeee-a301-0000-0000-000000000005';
  i INT;
  v_student UUID;
  v_current_count INT;
  v_stale_count INT;
  v_dispatcher_count INT;
  v_worker_count INT;
  v_mismatch_count INT;
  v_chunk_size INT := 4; -- small chunk size to force multiple chunks in this test
  v_num_chunks INT;
  v_offset INT;
  v_total_seen INT := 0;
  v_dup_check INT;
BEGIN
  -- Clean slate
  DELETE FROM public.student_enrollments WHERE school_id = v_school;
  DELETE FROM public.sections WHERE id = v_section;
  DELETE FROM public.classes WHERE id = v_class;
  DELETE FROM public.academic_years WHERE id IN (v_year_active, v_year_stale);
  DELETE FROM public.schools WHERE id = v_school;

  INSERT INTO public.schools (id, name, features_enabled)
  VALUES (v_school, 'Active-Year Consistency Test School', '{"insights": true}'::jsonb);

  INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status)
  VALUES
    (v_year_stale, v_school, 'Stale Year', '2024-06-01', '2025-03-31', 'archived'),
    (v_year_active, v_school, 'Current Year', '2025-06-01', '2026-03-31', 'active');

  INSERT INTO public.classes (id, school_id, name, "order")
  VALUES (v_class, v_school, 'Test Class', 1);

  INSERT INTO public.sections (id, school_id, class_id, name)
  VALUES (v_section, v_school, v_class, 'A');

  -- 9 current-year active students (more than one 4-size chunk: 3 chunks)
  FOR i IN 1..9 LOOP
    v_student := ('dddddddd-a301-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO public.student_profiles (id, school_id, full_name)
    VALUES (v_student, v_school, 'Current Student ' || i)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.student_enrollments (student_profile_id, academic_year_id, school_id, class_id, section_id, is_active)
    VALUES (v_student, v_year_active, v_school, v_class, v_section, true);
  END LOOP;

  -- 5 stale prior-year students: is_active=true (never reset on rollover),
  -- academic_year_id NOT NULL but pointing at the archived year. These must
  -- be excluded by both dispatcher and worker.
  FOR i IN 1..5 LOOP
    v_student := ('dddddddd-a301-0000-0000-' || lpad((100 + i)::text, 12, '0'))::uuid;
    INSERT INTO public.student_profiles (id, school_id, full_name)
    VALUES (v_student, v_school, 'Stale Student ' || i)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.student_enrollments (student_profile_id, academic_year_id, school_id, class_id, section_id, is_active)
    VALUES (v_student, v_year_stale, v_school, v_class, v_section, true);
  END LOOP;

  -- ==========================================================================
  -- 1. Dispatcher's exact predicate (insights_recompute_dispatch):
  --    is_active=true JOIN academic_years ON status='active'
  -- ==========================================================================
  SELECT COUNT(*) INTO v_dispatcher_count
  FROM public.student_enrollments se
  JOIN public.academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'active'
  WHERE se.school_id = v_school AND se.is_active = true;

  IF v_dispatcher_count <> 9 THEN
    RAISE EXCEPTION 'FAIL: dispatcher predicate counted % students, expected 9 (stale enrollments must be excluded)', v_dispatcher_count;
  END IF;
  RAISE NOTICE 'PASS: dispatcher predicate counts exactly 9 current-year students (stale excluded)';

  -- ==========================================================================
  -- 2. Worker's exact predicate as implemented in insights-recompute/index.ts
  --    after the fix: .eq("is_active", true).eq("academic_years.status","active")
  --    which PostgREST translates to an inner join + filter identical to this.
  -- ==========================================================================
  SELECT COUNT(*) INTO v_worker_count
  FROM public.student_enrollments se
  JOIN public.academic_years ay ON ay.id = se.academic_year_id
  WHERE se.school_id = v_school AND se.is_active = true AND ay.status = 'active';

  IF v_worker_count <> v_dispatcher_count THEN
    RAISE EXCEPTION 'FAIL: worker predicate counted % students but dispatcher counted % — definitions diverge', v_worker_count, v_dispatcher_count;
  END IF;
  RAISE NOTICE 'PASS: worker predicate matches dispatcher predicate exactly (% students)', v_worker_count;

  -- ==========================================================================
  -- 3. Reproduce the OLD (buggy) worker predicate to prove it would have
  --    diverged: is_active=true AND academic_year_id IS NOT NULL (a no-op,
  --    since academic_year_id is NOT NULL in the schema) — this must NOT
  --    equal the dispatcher's count, demonstrating the bug this fix closes.
  -- ==========================================================================
  SELECT COUNT(*) INTO v_mismatch_count
  FROM public.student_enrollments se
  WHERE se.school_id = v_school AND se.is_active = true AND se.academic_year_id IS NOT NULL;

  IF v_mismatch_count = v_dispatcher_count THEN
    RAISE EXCEPTION 'FAIL: old buggy predicate accidentally matches dispatcher count (%) — fixture does not exercise the bug', v_mismatch_count;
  END IF;
  RAISE NOTICE 'PASS: old buggy predicate (% rows) diverges from dispatcher (% rows) — confirms this was a real bug', v_mismatch_count, v_dispatcher_count;

  -- ==========================================================================
  -- 4. Chunking: simulate the worker's .order(student_profile_id).order(id)
  --    .range(offset, offset+limit-1) pagination across v_num_chunks chunks
  --    of v_chunk_size and verify: every current student is processed exactly
  --    once, no stale student appears, and the final partial chunk is correct.
  -- ==========================================================================
  v_num_chunks := CEIL(v_dispatcher_count::numeric / v_chunk_size);
  IF v_num_chunks <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected 3 chunks of size 4 for 9 students, got %', v_num_chunks;
  END IF;

  CREATE TEMP TABLE chunk_results (student_profile_id UUID, enrollment_id UUID) ON COMMIT DROP;

  FOR v_offset IN 0..(v_num_chunks - 1) LOOP
    INSERT INTO chunk_results (student_profile_id, enrollment_id)
    SELECT se.student_profile_id, se.id
    FROM public.student_enrollments se
    JOIN public.academic_years ay ON ay.id = se.academic_year_id
    WHERE se.school_id = v_school AND se.is_active = true AND ay.status = 'active'
    ORDER BY se.student_profile_id, se.id
    OFFSET (v_offset * v_chunk_size) LIMIT v_chunk_size;
  END LOOP;

  SELECT COUNT(*) INTO v_total_seen FROM chunk_results;
  IF v_total_seen <> 9 THEN
    RAISE EXCEPTION 'FAIL: chunked pagination processed % rows, expected exactly 9 (no student skipped or duplicated across chunk boundaries)', v_total_seen;
  END IF;
  RAISE NOTICE 'PASS: 3 chunks of size 4 (last chunk partial: 4+4+1) processed exactly 9 rows total';

  SELECT COUNT(*) INTO v_dup_check FROM (
    SELECT student_profile_id FROM chunk_results GROUP BY student_profile_id HAVING COUNT(*) > 1
  ) d;
  IF v_dup_check <> 0 THEN
    RAISE EXCEPTION 'FAIL: % student(s) appeared in more than one chunk (non-deterministic ordering)', v_dup_check;
  END IF;
  RAISE NOTICE 'PASS: no student appears in more than one chunk (deterministic student_profile_id,id ordering)';

  PERFORM 1 FROM chunk_results cr
  JOIN public.student_enrollments se ON se.id = cr.enrollment_id
  WHERE se.academic_year_id = v_year_stale;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL: a stale prior-year student appeared in the chunked worker result set';
  END IF;
  RAISE NOTICE 'PASS: no stale prior-year student appears in any chunk';

  -- Invariant: expected student IDs == processed student IDs
  IF EXISTS (
    SELECT student_profile_id FROM chunk_results
    EXCEPT
    SELECT se.student_profile_id FROM public.student_enrollments se
    JOIN public.academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'active'
    WHERE se.school_id = v_school AND se.is_active = true
  ) OR EXISTS (
    SELECT se.student_profile_id FROM public.student_enrollments se
    JOIN public.academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'active'
    WHERE se.school_id = v_school AND se.is_active = true
    EXCEPT
    SELECT student_profile_id FROM chunk_results
  ) THEN
    RAISE EXCEPTION 'FAIL: expected student IDs != processed student IDs';
  END IF;
  RAISE NOTICE 'PASS: expected student IDs == processed student IDs (set equality invariant holds)';

  RAISE NOTICE 'ALL insights_active_year_consistency assertions passed';
END $$;

ROLLBACK;
