-- supabase/migrations/20260823000001_kyc_documents_file_type_check.sql
--
-- Server-side backstop restricting kyc_documents.file_type to the same
-- allowlist the existing web admin upload UI already enforces client-side
-- (file input accept=".pdf,.jpg,.jpeg,.png",
-- apps/web/app/(school)/admin/students/[id]/student-documents-tab.tsx:132).
-- Applies uniformly to every caller (staff and the new parent upload path,
-- 20260823000000) since it's a table constraint, not per-RPC logic. NULL is
-- allowed so any row that omits file_type is unaffected.

ALTER TABLE public.kyc_documents
  ADD CONSTRAINT kyc_documents_file_type_check
  CHECK (file_type IS NULL OR file_type IN ('application/pdf', 'image/jpeg', 'image/png'));
