-- Migration: 20260828010000_fix_superadmin_feature_flag_bypass.sql
--
-- Fix: super_admin should BYPASS feature flag checks, not be subject to them
--
-- BUG: Current RLS policies have:
--   feature_enabled(school_id, 'insights') AND (super_admin OR ...)
--
-- This blocks super_admin when insights=false. Correct structure:
--   super_admin OR (feature_enabled(school_id, 'insights') AND ...)
--
-- Affects all 6 tables with insights feature flag enforcement

-- ============================================================================
-- 1. student_risk_snapshots
-- ============================================================================
DROP POLICY IF EXISTS "risk_snapshots_select" ON public.student_risk_snapshots;
CREATE POLICY "risk_snapshots_select" ON public.student_risk_snapshots FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'insights')
      AND school_id = public.get_my_school_id()
      AND (
        public.get_my_role() IN ('school_admin', 'principal')
        OR (
          public.get_my_role() = 'teacher'
          AND public.teaches_student(student_id)
        )
      )
    )
  );

-- ============================================================================
-- 2. insight_runs
-- ============================================================================
DROP POLICY IF EXISTS "insight_runs_select" ON public.insight_runs;
CREATE POLICY "insight_runs_select" ON public.insight_runs FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'insights')
      AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
    )
  );

-- ============================================================================
-- 3. insight_run_failures
-- ============================================================================
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

-- ============================================================================
-- 4. interventions
-- ============================================================================
DROP POLICY IF EXISTS "interventions_select" ON public.interventions;
CREATE POLICY "interventions_select" ON public.interventions FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'insights')
      AND school_id = public.get_my_school_id()
      AND (
        public.get_my_role() IN ('school_admin', 'principal')
        OR (
          public.get_my_role() = 'teacher'
          AND (assignee_id = auth.uid() OR public.teaches_student(student_id))
        )
      )
    )
  );

-- ============================================================================
-- 5. intervention_academic_evidence
-- ============================================================================
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

-- ============================================================================
-- 6. intervention_parent_notifications
-- ============================================================================
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
