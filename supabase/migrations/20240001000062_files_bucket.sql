-- Public bucket for syllabus PDFs and other general school files.
-- The syllabus upload flow (admin/syllabus) writes to bucket_id 'files';
-- previously this bucket was created by hand in Studio, so a fresh project
-- had no 'files' bucket and uploads failed with "bucket not configured".
INSERT INTO storage.buckets (id, name, public) VALUES ('files', 'files', true)
ON CONFLICT (id) DO NOTHING;

-- Admins/principals write; anyone reads (bucket is public).
DROP POLICY IF EXISTS "files_upload" ON storage.objects;
DROP POLICY IF EXISTS "files_update" ON storage.objects;
DROP POLICY IF EXISTS "files_delete" ON storage.objects;
DROP POLICY IF EXISTS "files_public_read" ON storage.objects;

CREATE POLICY "files_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'files' AND public._has_storage_admin_role());

CREATE POLICY "files_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'files' AND public._has_storage_admin_role());

CREATE POLICY "files_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'files' AND public._has_storage_admin_role());

CREATE POLICY "files_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'files');
