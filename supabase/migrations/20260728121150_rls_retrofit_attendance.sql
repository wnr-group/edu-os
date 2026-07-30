DROP POLICY IF EXISTS "attendance_select" ON public.attendance_records;
CREATE POLICY "attendance_select" ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'attendance') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "attendance_write" ON public.attendance_records;
CREATE POLICY "attendance_write" ON public.attendance_records FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'attendance') AND (
      (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.can_write_section_attendance(section_id))
    ))
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'attendance') AND (
      (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.can_write_section_attendance(section_id))
    ))
  );