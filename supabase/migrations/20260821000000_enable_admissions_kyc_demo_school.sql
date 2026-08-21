-- Enables the `admissions` and `kyc_documents` feature flags for the local
-- demo school (aaaaaaaa-0000-0000-0000-000000000001), which apps/mobile is
-- built against (see apps/mobile/.env.local / apps/mobile/app.json's
-- `extra.schoolId`). These two modules were seeded/backfilled OFF by
-- migration 20260727132543_feature_flags.sql ("not-yet-built modules
-- default OFF" — true at the time, since Parent Mobile Admission Enquiry
-- and KYC Documents didn't exist yet). Now that both are implemented
-- (apps/mobile/app/(parent)/admission-enquiry.tsx,
-- apps/mobile/app/(parent)/kyc-documents.tsx, gated in more.tsx via
-- useFeature("admissions") / useFeature("kyc_documents")), the demo school
-- needs both flags on for the entries to render — this was the confirmed
-- root cause of "feature not visible in Parent Mobile" investigated
-- separately (docs/superpowers/plans/2026-08-19-parent-admission-kyc-mobile.md).
--
-- Uses the same `||` jsonb-merge convention as the backfill in
-- 20260727132543_feature_flags.sql — merges in exactly these two keys,
-- leaves every other key in features_enabled untouched. Scoped to this one
-- school id only; safe to re-run (idempotent — merging {"admissions": true}
-- into a jsonb that already has "admissions": true is a no-op).

UPDATE public.schools
SET features_enabled = features_enabled || '{"admissions": true, "kyc_documents": true}'::jsonb
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
