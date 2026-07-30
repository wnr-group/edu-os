DROP POLICY IF EXISTS "syllabus_select" ON public.syllabus;
CREATE POLICY "syllabus_select" ON public.syllabus FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'syllabus') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "syllabus_write" ON public.syllabus;
CREATE POLICY "syllabus_write" ON public.syllabus FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'syllabus') AND (
      (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_class(class_id))
    ))
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'syllabus') AND (
      (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_class(class_id))
    ))
  );