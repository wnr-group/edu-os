-- Testing (quizzes) — Live Quiz mode, Phase 1b: RPCs.
--
-- Modifies two existing functions additively:
--   _grade_and_finalize_attempt — denominator is now sum(points) of
--     questions from joined_at_question_index onward, instead of always
--     qz.total_points. For every async attempt joined_at_question_index is
--     NULL, so the CASE collapses to the exact same qz.total_points-shaped
--     computation as before — async grading output is unchanged.
--   start_quiz_attempt — branches on quiz mode. The async branch (window
--     checks) is byte-for-byte the same logic as before; only a live-mode
--     branch (live_status/participant/late-join checks) is new.
--   force_submit_expired_attempts — adds a live-session disconnect safety
--     net (ends a stuck in-progress live session ~2 minutes past its current
--     question's time limit). Existing async sweeps are untouched.
--
-- Excluded participants: exclude_participant() finalizes their attempt (still
-- graded, kept for audit) but the *aggregate results/reporting* layer is
-- responsible for filtering on quiz_attempts.excluded — this migration does
-- not touch quiz_results semantics for that.

-- ── _grade_and_finalize_attempt — additive: live late-join denominator ─────
CREATE OR REPLACE FUNCTION public._grade_and_finalize_attempt(p_attempt_id uuid, p_auto boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_quiz_id uuid; v_student_id uuid; v_school_id uuid; v_has_pending boolean;
  v_joined_index smallint; v_max_points numeric; v_pass_mark smallint;
BEGIN
  SELECT quiz_id, student_id, school_id, joined_at_question_index
    INTO v_quiz_id, v_student_id, v_school_id, v_joined_index
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

  -- Denominator: full quiz total when joined_at_question_index IS NULL —
  -- true for every async attempt (unchanged from pre-live-mode behavior)
  -- and for a live attempt that joined on time at question 1. A live
  -- attempt that joined late only counts questions from its join point
  -- onward — missed questions are excluded from the denominator entirely
  -- rather than scored as zero.
  SELECT COALESCE(sum(points), 0) INTO v_max_points
  FROM public.quiz_questions
  WHERE quiz_id = v_quiz_id AND (v_joined_index IS NULL OR order_index >= v_joined_index);

  SELECT pass_mark_pct INTO v_pass_mark FROM public.quizzes WHERE id = v_quiz_id;

  -- FROM (SELECT 1) LEFT JOIN quiz_answers — always exactly one source row —
  -- so an attempt with zero answered questions still gets a quiz_results
  -- row (0 / max_points), instead of silently producing no row at all.
  INSERT INTO public.quiz_results (attempt_id, quiz_id, student_id, school_id, total_points, max_points, percentage, passed, fully_graded)
  SELECT
    p_attempt_id, v_quiz_id, v_student_id, v_school_id,
    COALESCE(sum(a.points_awarded), 0),
    v_max_points,
    CASE WHEN v_max_points > 0 THEN round(COALESCE(sum(a.points_awarded), 0) / v_max_points * 100, 2) ELSE 0 END,
    CASE WHEN v_pass_mark IS NULL THEN NULL
         ELSE (CASE WHEN v_max_points > 0 THEN COALESCE(sum(a.points_awarded), 0) / v_max_points * 100 ELSE 0 END) >= v_pass_mark END,
    NOT v_has_pending
  FROM (SELECT 1) dummy
  LEFT JOIN public.quiz_answers a ON a.attempt_id = p_attempt_id
  ON CONFLICT (attempt_id) DO UPDATE SET
    total_points = EXCLUDED.total_points, max_points = EXCLUDED.max_points,
    percentage = EXCLUDED.percentage, passed = EXCLUDED.passed,
    fully_graded = EXCLUDED.fully_graded, computed_at = now();

  IF NOT v_has_pending THEN
    UPDATE public.quiz_attempts SET status = 'graded' WHERE id = p_attempt_id;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._grade_and_finalize_attempt(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── start_quiz_attempt — additive live-mode branch ──────────────────────────
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid, p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_status public.quiz_status; v_mode public.quiz_mode;
  v_opens timestamptz; v_closes timestamptz;
  v_attempts_allowed smallint; v_section_id uuid; v_next_attempt smallint; v_id uuid;
  v_live_status public.quiz_live_status; v_live_index smallint; v_late_ok boolean;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id, status, mode, opens_at, closes_at, attempts_allowed, section_id,
         live_status, live_current_question_index, live_late_join_allowed
    INTO v_school_id, v_status, v_mode, v_opens, v_closes, v_attempts_allowed, v_section_id,
         v_live_status, v_live_index, v_late_ok
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'not_open'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    WHERE qa.quiz_id = p_quiz_id AND se.student_profile_id = p_student_id
  ) THEN RAISE EXCEPTION 'not_assigned'; END IF;

  IF v_mode = 'live' THEN
    IF v_live_status IS DISTINCT FROM 'in_progress' THEN RAISE EXCEPTION 'not_open'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.quiz_live_participants
      WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND status = 'excluded'
    ) THEN RAISE EXCEPTION 'excluded_from_quiz'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.quiz_live_participants WHERE quiz_id = p_quiz_id AND student_id = p_student_id
    ) THEN
      IF NOT v_late_ok THEN RAISE EXCEPTION 'late_join_not_allowed'; END IF;
      INSERT INTO public.quiz_live_participants (quiz_id, school_id, student_id, status)
      VALUES (p_quiz_id, v_school_id, p_student_id, 'joined');
    END IF;
  ELSE
    IF v_opens IS NOT NULL AND now() < v_opens THEN RAISE EXCEPTION 'not_open_yet'; END IF;
    IF v_closes IS NOT NULL AND now() > v_closes THEN RAISE EXCEPTION 'closed'; END IF;
  END IF;

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

  INSERT INTO public.quiz_attempts (quiz_id, school_id, student_id, attempt_number, created_by, joined_at_question_index)
  VALUES (p_quiz_id, v_school_id, p_student_id, v_next_attempt, auth.uid(),
          CASE WHEN v_mode = 'live' THEN v_live_index ELSE NULL END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid, uuid) TO authenticated;

-- ── force_submit_expired_attempts — additive live-session safety net ───────
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
      AND q.mode = 'async'
      AND (
        q.status = 'closed'
        OR (q.closes_at IS NOT NULL AND now() > q.closes_at)
        OR now() > a.started_at + make_interval(secs => q.duration_seconds)
      )
  LOOP
    PERFORM public._grade_and_finalize_attempt(r.id, true);
  END LOOP;

  -- live-quiz safety net: the host's own client drives advance_live_question
  -- / end_live_quiz in real time. This only fires when that stops happening
  -- (host disconnected) — a stuck session is ended outright (not auto-paced
  -- through remaining questions) once the current question's own time limit
  -- plus a 2-minute grace has passed. Coarse latency is fine; it is a net,
  -- not the primary driver.
  FOR r IN
    SELECT q.id FROM public.quizzes q
    JOIN public.quiz_questions qq ON qq.quiz_id = q.id AND qq.order_index = q.live_current_question_index
    WHERE q.mode = 'live' AND q.live_status = 'in_progress'
      AND now() > q.live_question_started_at + make_interval(secs => qq.time_limit_seconds) + interval '2 minutes'
  LOOP
    PERFORM public._end_live_quiz_core(r.id);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.force_submit_expired_attempts() FROM PUBLIC, anon, authenticated;

-- ── publish_quiz — additive: initialize live_status for live-mode quizzes ──
CREATE OR REPLACE FUNCTION public.publish_quiz(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_status public.quiz_status; v_mode public.quiz_mode;
  v_question_count int; v_bad_mcq int;
BEGIN
  SELECT school_id, section_id, status, mode, question_count
    INTO v_school_id, v_section_id, v_status, v_mode, v_question_count
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
      live_status = CASE WHEN v_mode = 'live' THEN 'not_started'::public.quiz_live_status ELSE live_status END,
      updated_at = now()
  WHERE id = p_quiz_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.publish', 'quizzes', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.publish_quiz(uuid) TO authenticated;

-- ── join_live_quiz — parent/student joins the waiting room ─────────────────
CREATE OR REPLACE FUNCTION public.join_live_quiz(p_quiz_id uuid, p_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_mode public.quiz_mode; v_status public.quiz_status;
  v_live_status public.quiz_live_status; v_late_ok boolean;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id, mode, status, live_status, live_late_join_allowed
    INTO v_school_id, v_mode, v_status, v_live_status, v_late_ok
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_mode <> 'live' THEN RAISE EXCEPTION 'not_live_quiz'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'not_open'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    WHERE qa.quiz_id = p_quiz_id AND se.student_profile_id = p_student_id
  ) THEN RAISE EXCEPTION 'not_assigned'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.quiz_live_participants
    WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND status = 'excluded'
  ) THEN RAISE EXCEPTION 'excluded_from_quiz'; END IF;

  IF v_live_status = 'ended' THEN RAISE EXCEPTION 'session_ended'; END IF;
  IF v_live_status = 'in_progress' AND NOT v_late_ok AND NOT EXISTS (
    SELECT 1 FROM public.quiz_live_participants WHERE quiz_id = p_quiz_id AND student_id = p_student_id
  ) THEN RAISE EXCEPTION 'late_join_not_allowed'; END IF;

  INSERT INTO public.quiz_live_participants (quiz_id, school_id, student_id, status)
  VALUES (p_quiz_id, v_school_id, p_student_id, 'joined')
  ON CONFLICT (quiz_id, student_id) DO UPDATE SET status = 'joined', updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.join_live_quiz(uuid, uuid) TO authenticated;

-- ── report_quiz_blocker — before/while waiting, student can't join ─────────
CREATE OR REPLACE FUNCTION public.report_quiz_blocker(
  p_quiz_id uuid, p_student_id uuid, p_reason public.quiz_blocker_reason, p_message text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_mode public.quiz_mode; v_live_status public.quiz_live_status; v_id uuid;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id, mode, live_status INTO v_school_id, v_mode, v_live_status
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_mode <> 'live' THEN RAISE EXCEPTION 'not_live_quiz'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    WHERE qa.quiz_id = p_quiz_id AND se.student_profile_id = p_student_id
  ) THEN RAISE EXCEPTION 'not_assigned'; END IF;
  IF v_live_status IS NOT NULL AND v_live_status <> 'not_started' THEN RAISE EXCEPTION 'session_already_started'; END IF;

  INSERT INTO public.quiz_blocker_reports (quiz_id, school_id, student_id, reason, message)
  VALUES (p_quiz_id, v_school_id, p_student_id, p_reason, NULLIF(btrim(p_message), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.report_quiz_blocker(uuid, uuid, public.quiz_blocker_reason, text) TO authenticated;

-- ── start_live_quiz — teacher starts the session at question 1 ─────────────
CREATE OR REPLACE FUNCTION public.start_live_quiz(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_mode public.quiz_mode; v_status public.quiz_status;
  v_live_status public.quiz_live_status; v_question_count int; v_missing_limits int;
BEGIN
  SELECT school_id, section_id, mode, status, live_status, question_count
    INTO v_school_id, v_section_id, v_mode, v_status, v_live_status, v_question_count
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_mode <> 'live' THEN RAISE EXCEPTION 'not_live_quiz'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'not_open'; END IF;
  IF v_live_status IS DISTINCT FROM 'not_started' THEN RAISE EXCEPTION 'already_started'; END IF;
  IF v_question_count = 0 THEN RAISE EXCEPTION 'no_questions'; END IF;

  SELECT count(*) INTO v_missing_limits FROM public.quiz_questions
  WHERE quiz_id = p_quiz_id AND time_limit_seconds IS NULL;
  IF v_missing_limits > 0 THEN RAISE EXCEPTION 'missing_time_limits'; END IF;

  UPDATE public.quizzes
  SET live_status = 'in_progress', live_current_question_index = 1, live_question_started_at = now()
  WHERE id = p_quiz_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.live_start', 'quizzes', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.start_live_quiz(uuid) TO authenticated;

-- ── _end_live_quiz_core — internal: grade-all + close, no auth check ───────
-- Shared by end_live_quiz (teacher-authorized), advance_live_question
-- (already-authorized caller, last question complete) and the cron safety
-- net (no interactive caller/GUCs at all) — mirrors the
-- _grade_and_finalize_attempt / force_submit_expired_attempts split.
CREATE OR REPLACE FUNCTION public._end_live_quiz_core(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  UPDATE public.quizzes SET live_status = 'ended', status = 'closed', updated_at = now()
  WHERE id = p_quiz_id AND live_status = 'in_progress';

  FOR r IN SELECT id FROM public.quiz_attempts WHERE quiz_id = p_quiz_id AND status = 'in_progress' LOOP
    PERFORM public._grade_and_finalize_attempt(r.id, true);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public._end_live_quiz_core(uuid) FROM PUBLIC, anon, authenticated;

-- ── end_live_quiz — teacher-initiated early end ─────────────────────────────
CREATE OR REPLACE FUNCTION public.end_live_quiz(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_section_id uuid; v_live_status public.quiz_live_status;
BEGIN
  SELECT school_id, section_id, live_status INTO v_school_id, v_section_id, v_live_status
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_live_status <> 'in_progress' THEN RAISE EXCEPTION 'not_in_progress'; END IF;

  PERFORM public._end_live_quiz_core(p_quiz_id);

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.live_end', 'quizzes', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.end_live_quiz(uuid) TO authenticated;

-- ── advance_live_question — host-invoked; server validates elapsed time ────
CREATE OR REPLACE FUNCTION public.advance_live_question(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_live_status public.quiz_live_status;
  v_current_index smallint; v_question_started_at timestamptz; v_question_count smallint;
  v_current_limit smallint;
BEGIN
  SELECT school_id, section_id, live_status, live_current_question_index, live_question_started_at, question_count
    INTO v_school_id, v_section_id, v_live_status, v_current_index, v_question_started_at, v_question_count
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_live_status <> 'in_progress' THEN RAISE EXCEPTION 'not_in_progress'; END IF;

  SELECT time_limit_seconds INTO v_current_limit
  FROM public.quiz_questions WHERE quiz_id = p_quiz_id AND order_index = v_current_index;

  -- server-side timing validation is the real enforcement point — the
  -- host's own countdown is only what triggers the call. 1s grace for
  -- clock skew/round-trip.
  IF now() < v_question_started_at + make_interval(secs => greatest(v_current_limit - 1, 0)) THEN
    RAISE EXCEPTION 'time_not_elapsed';
  END IF;

  IF v_current_index >= v_question_count THEN
    PERFORM public._end_live_quiz_core(p_quiz_id);
    INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
    VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.live_end', 'quizzes', p_quiz_id);
    RETURN;
  END IF;

  UPDATE public.quizzes
  SET live_current_question_index = v_current_index + 1, live_question_started_at = now()
  WHERE id = p_quiz_id;
END $$;
GRANT EXECUTE ON FUNCTION public.advance_live_question(uuid) TO authenticated;

-- ── acknowledge_blocker — teacher marks a report as seen ───────────────────
CREATE OR REPLACE FUNCTION public.acknowledge_blocker(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_section_id uuid;
BEGIN
  SELECT br.school_id, q.section_id INTO v_school_id, v_section_id
  FROM public.quiz_blocker_reports br JOIN public.quizzes q ON q.id = br.quiz_id
  WHERE br.id = p_report_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.quiz_blocker_reports
  SET status = 'acknowledged', resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_report_id;
END $$;
GRANT EXECUTE ON FUNCTION public.acknowledge_blocker(uuid) TO authenticated;

-- ── allow_late_join — teacher toggle, mid-session or before start ──────────
CREATE OR REPLACE FUNCTION public.allow_late_join(p_quiz_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_section_id uuid;
BEGIN
  SELECT school_id, section_id INTO v_school_id, v_section_id FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.quizzes SET live_late_join_allowed = p_enabled WHERE id = p_quiz_id;
END $$;
GRANT EXECUTE ON FUNCTION public.allow_late_join(uuid, boolean) TO authenticated;

-- ── exclude_participant — teacher removes a student from the live session ──
-- Their existing answers/attempt stay for audit; excluded=true is only a
-- filter flag the reporting layer applies, not a deletion.
CREATE OR REPLACE FUNCTION public.exclude_participant(p_quiz_id uuid, p_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_section_id uuid; v_attempt_id uuid;
BEGIN
  SELECT school_id, section_id INTO v_school_id, v_section_id FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.get_my_role() = 'super_admin' OR public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin', 'principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- upsert, not a plain UPDATE: a student who never joined (e.g. reported a
  -- blocker and never entered the waiting room) still needs a row here, so
  -- a later join_live_quiz/start_quiz_attempt attempt is actually blocked.
  INSERT INTO public.quiz_live_participants (quiz_id, school_id, student_id, status)
  VALUES (p_quiz_id, v_school_id, p_student_id, 'excluded')
  ON CONFLICT (quiz_id, student_id) DO UPDATE SET status = 'excluded', updated_at = now();

  UPDATE public.quiz_attempts SET excluded = true
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  SELECT id INTO v_attempt_id FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND status = 'in_progress';
  IF v_attempt_id IS NOT NULL THEN
    PERFORM public._grade_and_finalize_attempt(v_attempt_id, true);
  END IF;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.exclude_participant', 'quiz_attempts', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.exclude_participant(uuid, uuid) TO authenticated;

-- ── get_live_current_question — parent-facing, current question only ───────
-- Mirrors get_quiz_for_attempt's contract: option TEXT only, never is_correct.
CREATE OR REPLACE FUNCTION public.get_live_current_question(p_quiz_id uuid, p_student_id uuid)
RETURNS TABLE (
  question_id uuid, prompt text, type public.quiz_question_type, points smallint, order_index smallint,
  time_limit_seconds smallint, question_started_at timestamptz,
  option_id uuid, option_text text, option_order smallint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_current_index smallint; v_question_started_at timestamptz;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id, live_current_question_index, live_question_started_at
    INTO v_school_id, v_current_index, v_question_started_at
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_current_index IS NULL THEN RAISE EXCEPTION 'not_started'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quiz_live_participants
    WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND status = 'excluded'
  ) THEN RAISE EXCEPTION 'excluded_from_quiz'; END IF;

  RETURN QUERY
  SELECT q.id, q.prompt, q.type, q.points, q.order_index, q.time_limit_seconds, v_question_started_at,
         o.id, o.option_text, o.order_index
  FROM public.quiz_questions q
  LEFT JOIN public.quiz_options o ON o.question_id = q.id
  WHERE q.quiz_id = p_quiz_id AND q.order_index = v_current_index
  ORDER BY o.order_index;
END $$;
GRANT EXECUTE ON FUNCTION public.get_live_current_question(uuid, uuid) TO authenticated;
