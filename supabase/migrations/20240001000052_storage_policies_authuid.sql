-- Fix the remaining GUC-based storage policies (school-gallery, school-assets).
--
-- Same root cause as migration 51: Supabase Storage is a separate service that
-- does NOT run PostgREST's db-pre-request hook (scope_pre_request), so
-- app.school_id / app.role are never set and get_my_role() returns NULL on
-- storage requests. The gallery/asset upload+delete policies relied on
-- get_my_role(), so every admin upload failed with an RLS 403.
--
-- Rewrite them to authorize directly from auth.uid() against user_roles (the
-- same self-contained approach migration 51 used for homework attachments).
-- Behavior is preserved: these are role-only checks (no path/school scoping in
-- the originals), so any active super_admin / school_admin / principal role
-- (global super_admin with school_id IS NULL, or a per-school admin/principal)
-- may write. Both buckets remain public-read (unchanged).

CREATE OR REPLACE FUNCTION public._has_storage_admin_role()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active
      AND ur.role IN ('super_admin', 'school_admin', 'principal')
  );
$$;

-- school-gallery
DROP POLICY IF EXISTS "gallery_upload" ON storage.objects;
DROP POLICY IF EXISTS "gallery_delete" ON storage.objects;

CREATE POLICY "gallery_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'school-gallery' AND public._has_storage_admin_role());

CREATE POLICY "gallery_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'school-gallery' AND public._has_storage_admin_role());

-- school-assets
DROP POLICY IF EXISTS "school_assets_upload" ON storage.objects;
DROP POLICY IF EXISTS "school_assets_update" ON storage.objects;

CREATE POLICY "school_assets_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'school-assets' AND public._has_storage_admin_role());

CREATE POLICY "school_assets_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'school-assets' AND public._has_storage_admin_role());

-- student-photos
DROP POLICY IF EXISTS "student_photos_parent_upload" ON storage.objects;
DROP POLICY IF EXISTS "student_photos_parent_update" ON storage.objects;

CREATE POLICY "student_photos_parent_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-photos'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[2], '')::uuid)
  );

CREATE POLICY "student_photos_parent_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND public.is_parent_of_student(NULLIF((storage.foldername(name))[2], '')::uuid)
  );

