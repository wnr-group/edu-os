DROP POLICY IF EXISTS "timetable_select" ON public.timetable;
CREATE POLICY "timetable_select" ON public.timetable FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'timetable') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "timetable_write" ON public.timetable;
CREATE POLICY "timetable_write" ON public.timetable FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'timetable') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'timetable') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );