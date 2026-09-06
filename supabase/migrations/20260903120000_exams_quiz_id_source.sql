-- 20260903120000_exams_quiz_id_source.sql
-- Add quiz_id column to exams table so quiz-derived exams are self-describing
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exams_quiz_id ON public.exams(quiz_id) WHERE quiz_id IS NOT NULL;

-- Backfill any existing exams linked from quizzes
UPDATE public.exams e
SET quiz_id = q.id
FROM public.quizzes q
WHERE q.exam_id = e.id AND e.quiz_id IS NULL;

-- Update push_quiz_to_gradebook to stamp quiz_id on exams insert
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

  INSERT INTO public.exams (school_id, academic_year_id, name, start_date, end_date, quiz_id)
  VALUES (v_school_id, v_academic_year_id, v_title, current_date, current_date, p_quiz_id)
  RETURNING id INTO v_exam_id;

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