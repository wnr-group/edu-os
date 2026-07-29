DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'announcements') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "announcements_write" ON public.announcements;
CREATE POLICY "announcements_write" ON public.announcements FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'announcements') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'announcements') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  );