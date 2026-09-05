-- supabase/migrations/20260824000005_insights_risk_snapshots.sql
--
-- Creates three foundational tables for the Insights & Interventions V1 feature:
-- 1. student_risk_snapshots - stores computed risk scores for students
-- 2. insight_runs - tracks computation runs and their progress
-- 3. insight_run_failures - tracks errors encountered during computation
--
-- All tables include RLS policies following existing EduOS patterns.

-- ============================================================================
-- Table 1: student_risk_snapshots
-- ============================================================================

CREATE TABLE public.student_risk_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('attendance', 'academic')),
  computed_for  DATE NOT NULL,
  score         NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  band          TEXT NOT NULL CHECK (band IN ('LOW', 'MED', 'HIGH')),
  factors       JSONB NOT NULL DEFAULT '[]',
  recommended_action TEXT NOT NULL,
  subject_id    UUID REFERENCES public.subjects(id),
  params_hash   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, kind, computed_for, subject_id)
);

CREATE INDEX idx_risk_snapshots_school_student ON public.student_risk_snapshots(school_id, student_id);
CREATE INDEX idx_risk_snapshots_band ON public.student_risk_snapshots(school_id, band) WHERE band IN ('MED','HIGH');
CREATE INDEX idx_risk_snapshots_computed_for ON public.student_risk_snapshots(computed_for DESC);

-- Enable RLS on student_risk_snapshots
ALTER TABLE public.student_risk_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: risk_snapshots_select
-- Allow: super_admin, OR (school_admin/principal in same school), OR (teacher teaching the student)
CREATE POLICY "risk_snapshots_select" ON public.student_risk_snapshots FOR SELECT
  USING (
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
  );

-- ============================================================================
-- Table 2: insight_runs
-- ============================================================================

CREATE TABLE public.insight_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  run_date          DATE NOT NULL,
  chunk_offset      INT NOT NULL DEFAULT 0,
  chunk_limit       INT NOT NULL DEFAULT 1000,
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  students_total     INT NOT NULL DEFAULT 0,
  students_processed INT NOT NULL DEFAULT 0,
  students_failed     INT NOT NULL DEFAULT 0,
  worker_id         UUID,
  lease_expires_at  TIMESTAMPTZ,
  heartbeat_at      TIMESTAMPTZ,
  attempt           INT NOT NULL DEFAULT 1,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  params_hash       TEXT NOT NULL,
  trigger           TEXT NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron','manual')),
  UNIQUE (school_id, run_date, chunk_offset)
);

CREATE INDEX idx_insight_runs_incomplete ON public.insight_runs(run_date) WHERE status != 'completed';

-- Enable RLS on insight_runs
ALTER TABLE public.insight_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: insight_runs_select
-- Allow: super_admin, OR (school_admin/principal in same school), OR (teacher in same school)
CREATE POLICY "insight_runs_select" ON public.insight_runs FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
    )
  );

-- ============================================================================
-- Table 3: insight_run_failures
-- ============================================================================

CREATE TABLE public.insight_run_failures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES public.insight_runs(id) ON DELETE CASCADE,
  student_id   UUID REFERENCES public.student_profiles(id) ON DELETE SET NULL,
  kind         TEXT CHECK (kind IN ('attendance', 'academic')),
  subject_id   UUID REFERENCES public.subjects(id),
  error_message TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insight_run_failures_run ON public.insight_run_failures(run_id);

-- Enable RLS on insight_run_failures
ALTER TABLE public.insight_run_failures ENABLE ROW LEVEL SECURITY;

-- RLS Policy: insight_run_failures_select
-- Allow: super_admin, OR (school_admin/principal in same school), OR (teacher in same school)
-- We need to join through insight_runs to check school_id
CREATE POLICY "insight_run_failures_select" ON public.insight_run_failures FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      EXISTS (
        SELECT 1 FROM public.insight_runs ir
        WHERE ir.id = insight_run_failures.run_id
          AND ir.school_id = public.get_my_school_id()
      )
      AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
    )
  );
