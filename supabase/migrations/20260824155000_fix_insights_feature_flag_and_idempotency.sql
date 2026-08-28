-- Migration: 20260824155000_fix_insights_feature_flag_and_idempotency.sql
--
-- Fix BLOCKER 4: Add feature_enabled() checks to insights/interventions RLS
-- Fix BLOCKER 5: Fix snapshot idempotency with NULL subject_id
--
-- BLOCKER 4: RLS policies must enforce feature flag at database level
-- BLOCKER 5: UNIQUE constraint doesn't handle NULL subject_id correctly

-- ===========================================================================
-- BLOCKER 4: Add feature_enabled('insights') to RLS policies
-- ===========================================================================

-- Drop and recreate RLS policies with feature flag checks

-- student_risk_snapshots
DROP POLICY IF EXISTS "risk_snapshots_select" ON public.student_risk_snapshots;
CREATE POLICY "risk_snapshots_select" ON public.student_risk_snapshots FOR SELECT
  USING (
    public.feature_enabled(school_id, 'insights')
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        school_id = public.get_my_school_id()
        AND (
          public.get_my_role() IN ('school_admin', 'principal')
          OR (
            public.get_my_role() = 'teacher'
            AND public.teaches_student(student_id)
          )
        )
      )
    )
  );

-- insight_runs
DROP POLICY IF EXISTS "insight_runs_select" ON public.insight_runs;
CREATE POLICY "insight_runs_select" ON public.insight_runs FOR SELECT
  USING (
    public.feature_enabled(school_id, 'insights')
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        school_id = public.get_my_school_id()
        AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
      )
    )
  );

-- insight_run_failures
DROP POLICY IF EXISTS "insight_run_failures_select" ON public.insight_run_failures;
CREATE POLICY "insight_run_failures_select" ON public.insight_run_failures FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      EXISTS (
        SELECT 1 FROM public.insight_runs ir
        WHERE ir.id = insight_run_failures.run_id
          AND ir.school_id = public.get_my_school_id()
          AND public.feature_enabled(ir.school_id, 'insights')
      )
      AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
    )
  );

-- interventions
DROP POLICY IF EXISTS "interventions_select" ON public.interventions;
CREATE POLICY "interventions_select" ON public.interventions FOR SELECT
  USING (
    public.feature_enabled(school_id, 'insights')
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        school_id = public.get_my_school_id()
        AND (
          public.get_my_role() IN ('school_admin', 'principal')
          OR (
            public.get_my_role() = 'teacher'
            AND (assignee_id = auth.uid() OR public.teaches_student(student_id))
          )
        )
      )
    )
  );

-- intervention_academic_evidence
DROP POLICY IF EXISTS "intervention_academic_evidence_select" ON public.intervention_academic_evidence;
CREATE POLICY "intervention_academic_evidence_select" ON public.intervention_academic_evidence FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.interventions i
      WHERE i.id = intervention_academic_evidence.intervention_id
        AND public.feature_enabled(i.school_id, 'insights')
        AND i.school_id = public.get_my_school_id()
        AND (
          public.get_my_role() IN ('school_admin', 'principal')
          OR (
            public.get_my_role() = 'teacher'
            AND (i.assignee_id = auth.uid() OR public.teaches_student(i.student_id))
          )
        )
    )
  );

-- intervention_parent_notifications
DROP POLICY IF EXISTS "intervention_parent_notifications_select" ON public.intervention_parent_notifications;
CREATE POLICY "intervention_parent_notifications_select" ON public.intervention_parent_notifications FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.interventions i
      WHERE i.id = intervention_parent_notifications.intervention_id
        AND public.feature_enabled(i.school_id, 'insights')
        AND i.school_id = public.get_my_school_id()
        AND (
          public.get_my_role() IN ('school_admin', 'principal')
          OR (
            public.get_my_role() = 'teacher'
            AND (i.assignee_id = auth.uid() OR public.teaches_student(i.student_id))
          )
        )
    )
  );

-- ===========================================================================
-- BLOCKER 5: Fix snapshot idempotency with NULL subject_id
-- ===========================================================================

-- Drop the existing UNIQUE constraint
ALTER TABLE public.student_risk_snapshots
  DROP CONSTRAINT IF EXISTS student_risk_snapshots_school_id_student_id_kind_computed_for_subject_id_key;

-- Create partial unique indexes to handle NULL subject_id correctly
-- For non-NULL subject_id (academic snapshots)
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_snapshots_unique_with_subject
  ON public.student_risk_snapshots(school_id, student_id, kind, computed_for, subject_id)
  WHERE subject_id IS NOT NULL;

-- For NULL subject_id (attendance snapshots)
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_snapshots_unique_without_subject
  ON public.student_risk_snapshots(school_id, student_id, kind, computed_for)
  WHERE subject_id IS NULL;

COMMENT ON INDEX public.idx_risk_snapshots_unique_with_subject IS
  'Ensures one snapshot per student/kind/date/subject for academic snapshots';

COMMENT ON INDEX public.idx_risk_snapshots_unique_without_subject IS
  'Ensures one snapshot per student/kind/date for attendance snapshots (NULL subject_id)';
