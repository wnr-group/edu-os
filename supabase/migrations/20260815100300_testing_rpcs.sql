-- Testing (quizzes) — sub-project #6. Authoring, attempt-lifecycle, and
-- grading RPCs. Mirrors homework/leave: SECURITY DEFINER, SET search_path='',
-- feature_enabled() + role/ownership checks in every function, audit_log on
-- sensitive writes. See docs/superpowers/specs/2026-08-14-testing-design.md
-- and docs/superpowers/plans/2026-08-14-testing-implementation.md (Tasks 3-5, 7).
--
-- Two deliberate additions beyond the approved plan, both required for
-- correctness/security once the SQL was written out fully:
--   1. close_quiz(uuid) — the plan's push_quiz_to_gradebook requires
--      status = 'closed', but nothing produced that status. force_submit_
--      expired_attempts() now also auto-closes quizzes past closes_at, and
--      close_quiz() lets a teacher close one early.
--   2. submit_quiz_attempt's grading core is split into an internal
--      _grade_and_finalize_attempt(uuid, boolean) helper, REVOKEd from
--      PUBIC/anon/authenticated (matches the _vault_get precedent). The
--      plan's single function took an auto/manual boolean as a public
--      parameter — since this project grants EXECUTE to `authenticated` by
--      default for every new function (confirmed empirically, not revoked
--      globally), a client could otherwise pass true and bypass the
--      is_parent_of_student() ownership check entirely.

-- ── internal grading core — not client-callable ─────────────────────────────
CREATE OR REPLACE FUNCTION public._grade_and_finalize_attempt(p_attempt_id uuid, p_auto boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_quiz_id uuid; v_student_id uuid; v_school_id uuid; v_has_pending boolean;
BEGIN
  SELECT quiz_id, student_id, school_id INTO v_quiz_id, v_student_id, v_school_id
  FROM public.quiz_attempts WHERE id = p_attempt_id;

  -- auto-grade objective answers. The graded set is computed as a self-
  -- contained derived table (not a FROM...JOIN referencing the UPDATE
  -- target directly) since quiz_options must be joined on
  -- quiz_answers.selected_option_id, and Postgres does not allow a FROM-
  -- clause join to reference the row currently being updated.
  UPDATE public.quiz_answers a
  SET is_correct = g.is_correct,
      points_awarded = g.points_awarded,
      grading_status = 'auto'
  FROM (
    SELECT a2.id AS answer_id,
           COALESCE(o.is_correct, false) AS is_correct,
           CASE WHEN COALESCE(o.is_correct, false) THEN q.points ELSE 0 END AS points_awarded
    FROM public.quiz_answers a2
    JOIN public.quiz_questions q ON q.id = a2.question_id
    LEFT JOIN public.quiz_options o ON o.id = a2.selected_option_id
    WHERE a2.attempt_id = p_attempt_id AND q.type IN ('mcq', 'true_false')
  ) g
  WHERE a.id = g.answer_id;

  UPDATE public.quiz_answers a
  SET grading_status = 'pending_manual_grade'
  FROM public.quiz_questions q
  WHERE a.attempt_id = p_attempt_id AND a.question_id = q.id AND q.type = 'short_answer'
    AND a.grading_status = 'auto';

  UPDATE public.quiz_attempts
  SET status = 'submitted', submitted_at = now(), auto_submitted = p_auto
  WHERE id = p_attempt_id;

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_answers WHERE attempt_id = p_attempt_id AND grading_status = 'pending_manual_grade'
  ) INTO v_has_pending;

  -- FROM quizzes (always exactly one row) LEFT JOIN quiz_answers — so an
  -- attempt with zero answered questions still gets a quiz_results row
  -- (0 / max_points), instead of silently producing no row at all.
  INSERT INTO public.quiz_results (attempt_id, quiz_id, student_id, school_id, total_points, max_points, percentage, passed, fully_graded)
  SELECT
    p_attempt_id, v_quiz_id, v_student_id, v_school_id,
    COALESCE(sum(a.points_awarded), 0),
    qz.total_points,
    CASE WHEN qz.total_points > 0 THEN round(COALESCE(sum(a.points_awarded), 0) / qz.total_points * 100, 2) ELSE 0 END,
    CASE WHEN qz.pass_mark_pct IS NULL THEN NULL
         ELSE (CASE WHEN qz.total_points > 0 THEN COALESCE(sum(a.points_awarded), 0) / qz.total_points * 100 ELSE 0 END) >= qz.pass_mark_pct END,
    NOT v_has_pending
  FROM public.quizzes qz
  LEFT JOIN public.quiz_answers a ON a.attempt_id = p_attempt_id
  WHERE qz.id = v_quiz_id
  GROUP BY qz.total_points, qz.pass_mark_pct
  ON CONFLICT (attempt_id) DO UPDATE SET
    total_points = EXCLUDED.total_points, max_points = EXCLUDED.max_points,
    percentage = EXCLUDED.percentage, passed = EXCLUDED.passed,
    fully_graded = EXCLUDED.fully_graded, computed_at = now();

  IF NOT v_has_pending THEN
    UPDATE public.quiz_attempts SET status = 'graded' WHERE id = p_attempt_id;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._grade_and_finalize_attempt(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── submit_quiz_attempt — student/parent-facing, single attempt id only ────
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student_id uuid; v_status public.quiz_attempt_status; v_school_id uuid;
  v_mode public.quiz_mode; v_started_at timestamptz; v_duration integer; v_closes_at timestamptz;
BEGIN
  SELECT a.student_id, a.status, a.school_id, q.mode, a.started_at, q.duration_seconds, q.closes_at
    INTO v_student_id, v_status, v_school_id, v_mode, v_started_at, v_duration, v_closes_at
  FROM public.quiz_attempts a JOIN public.quizzes q ON q.id = a.quiz_id
  WHERE a.id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'already_submitted'; END IF;
  IF v_mode = 'async' AND ((v_closes_at IS NOT NULL AND now() > v_closes_at) OR now() > v_started_at + make_interval(secs => v_duration)) THEN
    PERFORM public._grade_and_finalize_attempt(p_attempt_id, true);
    RETURN;
  END IF;

  PERFORM public._grade_and_finalize_attempt(p_attempt_id, false);
END $$;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid) TO authenticated;

-- ── force_submit_expired_attempts — pg_cron only, also auto-closes quizzes ─
CREATE OR REPLACE FUNCTION public.force_submit_expired_attempts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  -- scheduled -> open once the window arrives on its own (no teacher edit).
  -- publish_quiz only computes this once, at publish time; the teacher-edit
  -- path (availability-tab.tsx) updates it immediately on save, this is the
  -- symmetric sweep for quizzes nobody touches after publishing.
  UPDATE public.quizzes
  SET status = 'open', updated_at = now()
  WHERE status = 'scheduled'
    AND (opens_at IS NULL OR now() >= opens_at)
    AND (closes_at IS NULL OR now() < closes_at);

  UPDATE public.quizzes
  SET status = 'closed', updated_at = now()
  WHERE status IN ('open', 'scheduled') AND closes_at IS NOT NULL AND now() > closes_at;

  FOR r IN
    SELECT a.id FROM public.quiz_attempts a
    JOIN public.quizzes q ON q.id = a.quiz_id
    WHERE a.status = 'in_progress'
      AND (
        q.status = 'closed'
        OR (q.closes_at IS NOT NULL AND now() > q.closes_at)
        OR now() > a.started_at + make_interval(secs => q.duration_seconds)
      )
  LOOP
    PERFORM public._grade_and_finalize_attempt(r.id, true);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.force_submit_expired_attempts() FROM PUBLIC, anon, authenticated;

-- ── close_quiz — teacher-initiated early close ──────────────────────────────
CREATE OR REPLACE FUNCTION public.close_quiz(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_section_id uuid; v_status public.quiz_status;
BEGIN
  SELECT school_id, section_id, status INTO v_school_id, v_section_id, v_status
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status NOT IN ('open', 'scheduled') THEN RAISE EXCEPTION 'not_open'; END IF;

  UPDATE public.quizzes SET status = 'closed', updated_at = now() WHERE id = p_quiz_id;
  PERFORM public.force_submit_expired_attempts();

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.close', 'quizzes', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.close_quiz(uuid) TO authenticated;

-- ── publish_quiz — validates, locks question edits, auto-assigns own section ─
CREATE OR REPLACE FUNCTION public.publish_quiz(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_status public.quiz_status;
  v_question_count int; v_bad_mcq int;
BEGIN
  SELECT school_id, section_id, status, question_count INTO v_school_id, v_section_id, v_status, v_question_count
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'already_published'; END IF;
  IF v_question_count = 0 THEN RAISE EXCEPTION 'no_questions'; END IF;

  -- every mcq/true_false question must have exactly one correct option
  SELECT count(*) INTO v_bad_mcq FROM public.quiz_questions q
  WHERE q.quiz_id = p_quiz_id AND q.type IN ('mcq', 'true_false')
    AND (SELECT count(*) FROM public.quiz_options o WHERE o.question_id = q.id AND o.is_correct) <> 1;
  IF v_bad_mcq > 0 THEN RAISE EXCEPTION 'invalid_correct_answers'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quiz_assignments WHERE quiz_id = p_quiz_id) THEN
    INSERT INTO public.quiz_assignments (quiz_id, school_id, class_id, section_id)
    SELECT p_quiz_id, v_school_id, class_id, v_section_id FROM public.quizzes WHERE id = p_quiz_id;
  END IF;

  UPDATE public.quizzes
  SET status = CASE WHEN opens_at IS NULL OR opens_at <= now() THEN 'open'::public.quiz_status ELSE 'scheduled'::public.quiz_status END,
      updated_at = now()
  WHERE id = p_quiz_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.publish', 'quizzes', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.publish_quiz(uuid) TO authenticated;

-- ── push_quiz_to_gradebook — opt-in, once, only after grading completes ────
CREATE OR REPLACE FUNCTION public.push_quiz_to_gradebook(p_quiz_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_academic_year_id uuid; v_title text;
  v_status public.quiz_status; v_pushed_at timestamptz; v_pending int; v_exam_id uuid;
BEGIN
  SELECT school_id, section_id, academic_year_id, title, status, pushed_to_gradebook_at
    INTO v_school_id, v_section_id, v_academic_year_id, v_title, v_status, v_pushed_at
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'closed' THEN RAISE EXCEPTION 'not_closed'; END IF;
  IF v_pushed_at IS NOT NULL THEN RAISE EXCEPTION 'already_pushed'; END IF;

  SELECT count(*) INTO v_pending FROM public.quiz_answers a
  JOIN public.quiz_attempts t ON t.id = a.attempt_id
  WHERE t.quiz_id = p_quiz_id AND a.grading_status = 'pending_manual_grade';
  IF v_pending > 0 THEN RAISE EXCEPTION 'grading_incomplete'; END IF;

  INSERT INTO public.exams (school_id, academic_year_id, name, start_date, end_date)
  VALUES (v_school_id, v_academic_year_id, v_title, current_date, current_date)
  RETURNING id INTO v_exam_id;

  -- A quiz can allow multiple attempts (attempts_allowed) — only the
  -- student's latest attempt is pushed, matching the "latest attempt" rule
  -- used everywhere else (results list/drill-down pages). Without this,
  -- a retaken quiz inserts two rows for the same (exam_id, student_id,
  -- subject_id) and violates exam_results' unique constraint.
  INSERT INTO public.exam_results (school_id, exam_id, student_id, subject_id, marks_obtained, max_marks, teacher_id)
  SELECT v_school_id, v_exam_id, r.student_id, q.subject_id, r.total_points, r.max_points, auth.uid()
  FROM public.quiz_results r
  JOIN public.quiz_attempts a ON a.id = r.attempt_id
  JOIN public.quizzes q ON q.id = r.quiz_id
  WHERE r.quiz_id = p_quiz_id AND r.fully_graded
    AND a.attempt_number = (
      SELECT max(a2.attempt_number) FROM public.quiz_attempts a2
      WHERE a2.quiz_id = p_quiz_id AND a2.student_id = a.student_id
    );

  UPDATE public.quizzes SET exam_id = v_exam_id, pushed_to_gradebook_at = now() WHERE id = p_quiz_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.push_to_gradebook', 'quizzes', p_quiz_id,
          jsonb_build_object('exam_id', v_exam_id));

  RETURN v_exam_id;
END $$;
GRANT EXECUTE ON FUNCTION public.push_quiz_to_gradebook(uuid) TO authenticated;

-- ── get_quiz_for_attempt — question/option TEXT only, never is_correct ─────
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(p_attempt_id uuid)
RETURNS TABLE (
  question_id uuid, prompt text, type public.quiz_question_type, points smallint, order_index smallint,
  option_id uuid, option_text text, option_order smallint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid; v_school_id uuid;
BEGIN
  SELECT student_id, school_id INTO v_student_id, v_school_id FROM public.quiz_attempts WHERE id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  RETURN QUERY
  SELECT q.id, q.prompt, q.type, q.points, q.order_index, o.id, o.option_text, o.order_index
  FROM public.quiz_attempts a
  JOIN public.quiz_questions q ON q.quiz_id = a.quiz_id
  LEFT JOIN public.quiz_options o ON o.question_id = q.id
  WHERE a.id = p_attempt_id
  ORDER BY q.order_index, o.order_index;
END $$;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid) TO authenticated;

-- ── start_quiz_attempt — window + assignment + attempts_allowed checks ─────
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid, p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_status public.quiz_status; v_opens timestamptz; v_closes timestamptz;
  v_attempts_allowed smallint; v_section_id uuid; v_next_attempt smallint; v_id uuid;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id, status, opens_at, closes_at, attempts_allowed, section_id
    INTO v_school_id, v_status, v_opens, v_closes, v_attempts_allowed, v_section_id
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'not_open'; END IF;
  IF v_opens IS NOT NULL AND now() < v_opens THEN RAISE EXCEPTION 'not_open_yet'; END IF;
  IF v_closes IS NOT NULL AND now() > v_closes THEN RAISE EXCEPTION 'closed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    WHERE qa.quiz_id = p_quiz_id AND se.student_profile_id = p_student_id
  ) THEN RAISE EXCEPTION 'not_assigned'; END IF;

  -- resume an existing in_progress attempt instead of starting a new one —
  -- must happen BEFORE the attempts_allowed check below: an in-progress
  -- attempt already counts toward max(attempt_number), so checking the
  -- quota first would incorrectly block a student who simply reloaded
  -- mid-attempt (the default attempts_allowed=1 made this always fail).
  SELECT id INTO v_id FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND status = 'in_progress';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_next_attempt
  FROM public.quiz_attempts WHERE quiz_id = p_quiz_id AND student_id = p_student_id;
  IF v_next_attempt > v_attempts_allowed THEN RAISE EXCEPTION 'no_attempts_remaining'; END IF;

  INSERT INTO public.quiz_attempts (quiz_id, school_id, student_id, attempt_number, created_by)
  VALUES (p_quiz_id, v_school_id, p_student_id, v_next_attempt, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid, uuid) TO authenticated;

-- ── save_quiz_answer — upsert; validates the question/option actually
-- belong to the attempt's quiz (prevents cross-question option grafting) ────
CREATE OR REPLACE FUNCTION public.save_quiz_answer(
  p_attempt_id uuid, p_question_id uuid, p_selected_option_id uuid, p_short_text text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student_id uuid; v_status public.quiz_attempt_status; v_school_id uuid; v_quiz_id uuid;
  v_mode public.quiz_mode; v_started_at timestamptz; v_duration integer; v_closes_at timestamptz;
BEGIN
  SELECT a.student_id, a.status, a.school_id, a.quiz_id, q.mode, a.started_at, q.duration_seconds, q.closes_at
    INTO v_student_id, v_status, v_school_id, v_quiz_id, v_mode, v_started_at, v_duration, v_closes_at
  FROM public.quiz_attempts a JOIN public.quizzes q ON q.id = a.quiz_id
  WHERE a.id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'attempt_closed'; END IF;
  IF v_mode = 'async' AND ((v_closes_at IS NOT NULL AND now() > v_closes_at) OR now() > v_started_at + make_interval(secs => v_duration)) THEN
    RAISE EXCEPTION 'attempt_expired';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quiz_questions WHERE id = p_question_id AND quiz_id = v_quiz_id) THEN
    RAISE EXCEPTION 'question_not_in_quiz';
  END IF;
  IF p_selected_option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quiz_options WHERE id = p_selected_option_id AND question_id = p_question_id
  ) THEN
    RAISE EXCEPTION 'option_not_in_question';
  END IF;

  INSERT INTO public.quiz_answers (attempt_id, question_id, school_id, selected_option_id, short_answer_text, answered_at)
  VALUES (p_attempt_id, p_question_id, v_school_id, p_selected_option_id, NULLIF(btrim(p_short_text), ''), now())
  ON CONFLICT (attempt_id, question_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        short_answer_text = EXCLUDED.short_answer_text,
        answered_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.save_quiz_answer(uuid, uuid, uuid, text) TO authenticated;

-- ── grade_short_answer — teacher marks a pending short-answer ──────────────
CREATE OR REPLACE FUNCTION public.grade_short_answer(p_answer_id uuid, p_points numeric, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt_id uuid; v_question_id uuid; v_max_points smallint; v_type public.quiz_question_type;
  v_section_id uuid; v_school_id uuid; v_quiz_id uuid;
  v_total numeric; v_max numeric; v_pct numeric; v_pass smallint; v_pending boolean;
BEGIN
  SELECT a.attempt_id, a.question_id, q.points, q.type, qz.section_id, a.school_id, qz.id
    INTO v_attempt_id, v_question_id, v_max_points, v_type, v_section_id, v_school_id, v_quiz_id
  FROM public.quiz_answers a
  JOIN public.quiz_questions q ON q.id = a.question_id
  JOIN public.quizzes qz ON qz.id = q.quiz_id
  WHERE a.id = p_answer_id;
  IF v_attempt_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_type <> 'short_answer' THEN RAISE EXCEPTION 'not_short_answer'; END IF;
  IF p_points < 0 OR p_points > v_max_points THEN RAISE EXCEPTION 'points_out_of_range'; END IF;

  UPDATE public.quiz_answers
  SET points_awarded = p_points, is_correct = (p_points = v_max_points),
      grading_status = 'manually_graded', graded_by = auth.uid(), graded_at = now()
  WHERE id = p_answer_id;

  SELECT COALESCE(sum(a.points_awarded), 0), r.max_points, qz.pass_mark_pct
    INTO v_total, v_max, v_pass
  FROM public.quiz_answers a
  JOIN public.quiz_results r ON r.attempt_id = v_attempt_id
  JOIN public.quizzes qz ON qz.id = v_quiz_id
  WHERE a.attempt_id = v_attempt_id
  GROUP BY r.max_points, qz.pass_mark_pct;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.quiz_answers WHERE attempt_id = v_attempt_id AND grading_status = 'pending_manual_grade'
  ) INTO v_pending;
  v_pct := CASE WHEN v_max > 0 THEN round(v_total / v_max * 100, 2) ELSE 0 END;

  UPDATE public.quiz_results
  SET total_points = v_total, percentage = v_pct,
      passed = CASE WHEN v_pass IS NULL THEN NULL ELSE v_pct >= v_pass END,
      fully_graded = v_pending, computed_at = now()
  WHERE attempt_id = v_attempt_id;

  IF v_pending THEN
    UPDATE public.quiz_attempts SET status = 'graded' WHERE id = v_attempt_id;
  END IF;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.grade_short_answer', 'quiz_answers', p_answer_id,
          jsonb_build_object('points', p_points, 'note', p_note));
END $$;
GRANT EXECUTE ON FUNCTION public.grade_short_answer(uuid, numeric, text) TO authenticated;

-- ── get_quiz_review — post-grading answer review, gated on show_answers_after_close ─
CREATE OR REPLACE FUNCTION public.get_quiz_review(p_attempt_id uuid)
RETURNS TABLE (
  question_id uuid, prompt text, points smallint,
  selected_option_id uuid, selected_text text, is_correct boolean, points_awarded numeric,
  correct_option_id uuid, correct_text text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid; v_quiz_id uuid; v_show boolean; v_status public.quiz_attempt_status; v_school_id uuid;
BEGIN
  SELECT t.student_id, t.quiz_id, t.status, qz.show_answers_after_close, t.school_id
    INTO v_student_id, v_quiz_id, v_status, v_show, v_school_id
  FROM public.quiz_attempts t JOIN public.quizzes qz ON qz.id = t.quiz_id
  WHERE t.id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_status <> 'graded' OR NOT v_show THEN RAISE EXCEPTION 'review_not_available'; END IF;

  RETURN QUERY
  SELECT q.id, q.prompt, q.points,
         a.selected_option_id, so.option_text, a.is_correct, a.points_awarded,
         co.id, co.option_text
  FROM public.quiz_questions q
  JOIN public.quiz_answers a ON a.question_id = q.id AND a.attempt_id = p_attempt_id
  LEFT JOIN public.quiz_options so ON so.id = a.selected_option_id
  LEFT JOIN public.quiz_options co ON co.question_id = q.id AND co.is_correct
  WHERE q.quiz_id = v_quiz_id
  ORDER BY q.order_index;
END $$;
GRANT EXECUTE ON FUNCTION public.get_quiz_review(uuid) TO authenticated;
