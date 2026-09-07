-- Migration: 20260902000001_fix_snapshot_nulls_not_distinct.sql
--
-- Finding #2: Fix student_risk_snapshots unique constraint to use
-- NULLS NOT DISTINCT so that NULL subject_id is treated as equal.
--
-- Background: 20260824155000 created two partial indexes (one WHERE subject_id
-- IS NOT NULL, one WHERE subject_id IS NULL) to work around NULL uniqueness.
-- However PostgREST/Supabase upsert with onConflict over a 5-column list
-- (school_id,student_id,kind,computed_for,subject_id) requires a single
-- unique index that covers all five columns including NULL subject_id.
-- With partial indexes, PostgREST cannot resolve the conflict target and the
-- upsert fails or inserts duplicates.
--
-- PostgreSQL 15+ NULLS NOT DISTINCT on a unique index treats all NULLs as
-- equal, which is the correct semantic here: one row per
-- (school_id, student_id, kind, computed_for, subject_id) where
-- subject_id=NULL means attendance snapshot (not per-subject).

-- ===========================================================================
-- 1. Drop the partial indexes created by 20260824155000
-- ===========================================================================

DROP INDEX IF EXISTS public.idx_risk_snapshots_unique_with_subject;
DROP INDEX IF EXISTS public.idx_risk_snapshots_unique_without_subject;

-- ===========================================================================
-- 2. Drop any legacy unique constraint on the table (name truncated to 63 bytes
--    by PostgreSQL — actual constraint name derived from pg_constraint metadata)
-- ===========================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.student_risk_snapshots'::regclass
    AND contype = 'u'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.student_risk_snapshots DROP CONSTRAINT IF EXISTS %I', v_conname);
  END IF;
END $$;

-- ===========================================================================
-- 3. Create a single NULLS NOT DISTINCT unique index covering all 5 columns
-- ===========================================================================

CREATE UNIQUE INDEX idx_risk_snapshots_unique
  ON public.student_risk_snapshots (school_id, student_id, kind, computed_for, subject_id)
  NULLS NOT DISTINCT;

COMMENT ON INDEX public.idx_risk_snapshots_unique IS
  'One snapshot per (school, student, kind, date, subject) — NULL subject_id treated as equal (attendance snapshots)';
