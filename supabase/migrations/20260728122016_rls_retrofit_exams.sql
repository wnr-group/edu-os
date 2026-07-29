DROP POLICY IF EXISTS "exams_select" ON public.exams;
CREATE POLICY "exams_select" ON public.exams FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'exams') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "exams_write" ON public.exams;
CREATE POLICY "exams_write" ON public.exams FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'exams') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'exams') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "exam_results_select" ON public.exam_results;
CREATE POLICY "exam_results_select" ON public.exam_results FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'exams') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "exam_results_write" ON public.exam_results;
CREATE POLICY "exam_results_write" ON public.exam_results FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'exams') AND (
      (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_student(student_id))
    ))
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'exams') AND (
      (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_student(student_id))
    ))
  );