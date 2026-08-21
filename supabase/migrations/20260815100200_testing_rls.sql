-- Testing (quizzes) — sub-project #6. RLS only; RPCs land in the next phase.
-- Mirrors homework_status / leave_requests: quiz_attempts/quiz_answers/
-- quiz_results are SELECT-only, deny-by-default writes (all writes go
-- through SECURITY DEFINER RPCs added next). quiz_questions/quiz_options
-- carry no parent/student SELECT policy at all — correct answers are only
-- ever exposed via a stripped RPC response, never a table read.
-- See docs/superpowers/specs/2026-08-14-testing-design.md (D-T5) and
-- docs/superpowers/plans/2026-08-14-testing-implementation.md (Task 6).

-- Helper: lets quizzes_select_parent check assignment+enrollment without a
-- parent-facing policy on quiz_assignments/student_enrollments (SECURITY
-- DEFINER runs as the table owner, so it isn't subject to their RLS).
CREATE OR REPLACE FUNCTION public.quiz_visible_to_parent(p_quiz_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    JOIN public.student_profiles sp ON sp.id = se.student_profile_id
    WHERE qa.quiz_id = p_quiz_id AND sp.parent_profile_id = auth.uid()
  );
$$;

-- ── quizzes ──────────────────────────────────────────────────────────────
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quizzes_select_staff" ON public.quizzes FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quizzes_select_parent" ON public.quizzes FOR SELECT USING (
  public.feature_enabled(school_id, 'testing')
  AND school_id = public.get_my_school_id()
  AND status <> 'draft'
  AND public.quiz_visible_to_parent(id)
);
CREATE POLICY "quizzes_insert" ON public.quizzes FOR INSERT WITH CHECK (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
);
CREATE POLICY "quizzes_update" ON public.quizzes FOR UPDATE USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
) WITH CHECK (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
);
CREATE POLICY "quizzes_delete" ON public.quizzes FOR DELETE USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id))
      AND status = 'draft')
);

-- ── quiz_questions — no parent/student SELECT at all (D-T5) ────────────────
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_questions_select" ON public.quiz_questions FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quiz_questions_write" ON public.quiz_questions FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal')
           OR EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND public.teaches_section(qz.section_id)))
      AND EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND qz.status = 'draft'))
) WITH CHECK (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal')
           OR EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND public.teaches_section(qz.section_id)))
      AND EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND qz.status = 'draft'))
);

-- ── quiz_options — protects is_correct; no parent/student SELECT (D-T5) ───
ALTER TABLE public.quiz_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_options_select_staff" ON public.quiz_options FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quiz_options_write" ON public.quiz_options FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND EXISTS (
        SELECT 1 FROM public.quiz_questions q JOIN public.quizzes qz ON qz.id = q.quiz_id
        WHERE q.id = quiz_options.question_id AND qz.status = 'draft'
          AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(qz.section_id))
      ))
) WITH CHECK (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND EXISTS (
        SELECT 1 FROM public.quiz_questions q JOIN public.quizzes qz ON qz.id = q.quiz_id
        WHERE q.id = quiz_options.question_id AND qz.status = 'draft'
          AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(qz.section_id))
      ))
);

-- ── quiz_assignments — staff-only, never read directly by parents ─────────
ALTER TABLE public.quiz_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_assignments_select" ON public.quiz_assignments FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quiz_assignments_write" ON public.quiz_assignments FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
) WITH CHECK (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
);

-- ── quiz_attempts / quiz_answers / quiz_results — SELECT-only, deny-by-
-- default writes (mirrors homework_status / leave_requests exactly) ────────
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_attempts_select" ON public.quiz_attempts FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin','principal')
     OR public.teaches_student(student_id)
     OR public.is_parent_of_student(student_id)
  ))
);
CREATE POLICY "quiz_answers_select" ON public.quiz_answers FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id() AND EXISTS (
        SELECT 1 FROM public.quiz_attempts t WHERE t.id = quiz_answers.attempt_id AND (
          public.get_my_role() IN ('school_admin','principal')
          OR public.teaches_student(t.student_id)
          OR (public.is_parent_of_student(t.student_id) AND t.status IN ('submitted','graded'))
        )
  ))
);
CREATE POLICY "quiz_results_select" ON public.quiz_results FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin','principal')
     OR public.teaches_student(student_id)
     OR public.is_parent_of_student(student_id)
  ))
);
-- No INSERT/UPDATE/DELETE policy on any of the three. All writes happen via
-- SECURITY DEFINER RPCs in the next phase (start_quiz_attempt, save_quiz_answer,
-- submit_quiz_attempt, grade_short_answer, force_submit_expired_attempts),
-- which bypass RLS as the function owner — exactly like homework_status.
