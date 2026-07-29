-- Table rows only — the storage.objects bucket policies (gallery_upload/delete
-- + the publicly-readable gallery_public_read) are NOT touched here; see note above.
DROP POLICY IF EXISTS "gallery_admin_all" ON public.school_gallery;
CREATE POLICY "gallery_admin_all" ON public.school_gallery FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'gallery') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'gallery') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "gallery_read" ON public.school_gallery;
CREATE POLICY "gallery_read" ON public.school_gallery FOR SELECT
  USING (public.feature_enabled(school_id,'gallery') AND school_id = public.get_my_school_id());