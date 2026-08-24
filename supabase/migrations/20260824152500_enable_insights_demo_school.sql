-- supabase/migrations/20260824152500_enable_insights_demo_school.sql
--
-- Enable 'insights' feature module for Demo School
--
-- Scoped to Demo School (aaaaaaaa-0000-0000-0000-000000000001) only.
-- Safe to re-run (idempotent jsonb merge).

UPDATE public.schools
SET features_enabled = features_enabled || '{"insights": true}'::jsonb
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
