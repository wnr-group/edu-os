-- supabase/migrations/20260824151500_interventions_schema.sql
--
-- Insights & Interventions V1 - Task #4, #4b, #4c: Interventions Domain Data Model
--
-- Creates:
-- 1. Enums: intervention_kind, intervention_status, intervention_type
-- 2. Table: interventions (with terminal check constraint and partial unique index)
-- 3. Table: intervention_academic_evidence (evidence tracking for academic interventions)
-- 4. Table: intervention_parent_notifications (idempotency-keyed parent notifications)
-- 5. RLS policies for all three tables (staff-only read, parents denied)

-- ============================================================================
-- 1. Enums
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intervention_kind') THEN
    CREATE TYPE public.intervention_kind AS ENUM ('attendance', 'academic');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intervention_status') THEN
    CREATE TYPE public.intervention_status AS ENUM ('pending', 'in_progress', 'completed', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intervention_type') THEN
    CREATE TYPE public.intervention_type AS ENUM (
      'CONTACT_PARENT', 'DISCUSS_ATTENDANCE_PATTERN', 'MONITOR', 'ASSIGN_ACADEMIC_SUPPORT'
    );
  END IF;
END $$;

-- ============================================================================
-- 2. Table: interventions
-- ============================================================================

CREATE TABLE public.interventions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  kind                public.intervention_kind NOT NULL,
  type                public.intervention_type NOT NULL,
  title               TEXT NOT NULL,
  source_snapshot_id  UUID NOT NULL REFERENCES public.student_risk_snapshots(id),
  status              public.intervention_status NOT NULL DEFAULT 'pending',
  severity_band       TEXT NOT NULL CHECK (severity_band IN ('MED','HIGH')),
  assignee_id         UUID NOT NULL REFERENCES auth.users(id),
  assigned_via        TEXT NOT NULL CHECK (assigned_via IN ('class_teacher','admin_fallback','reassigned')),
  due_date            DATE NOT NULL,
  due_date_original    DATE NOT NULL,
  outcome_note        TEXT,
  dismissal_reason    TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  dismissed_at         TIMESTAMPTZ,
  resolved_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_terminal_fields CHECK (
    (status = 'dismissed' AND dismissal_reason IS NOT NULL AND dismissed_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR (status IN ('pending','in_progress'))
  )
);

-- Partial unique index: at most one open intervention per student per kind
CREATE UNIQUE INDEX uq_interventions_open_per_student_kind
  ON public.interventions (student_id, kind)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_interventions_school_status ON public.interventions(school_id, status);
CREATE INDEX idx_interventions_assignee ON public.interventions(assignee_id, status);
CREATE INDEX idx_interventions_due_date ON public.interventions(due_date) WHERE status IN ('pending','in_progress');
CREATE INDEX idx_interventions_student ON public.interventions(student_id);

-- Enable RLS
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Staff read access (super_admin, school_admin/principal, or assigned/student-teaching teacher)
CREATE POLICY "interventions_select" ON public.interventions FOR SELECT
  USING (
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
  );

-- ============================================================================
-- 3. Table: intervention_academic_evidence
-- ============================================================================

CREATE TABLE public.intervention_academic_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  snapshot_id     UUID NOT NULL REFERENCES public.student_risk_snapshots(id),
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intervention_id, snapshot_id)
);

CREATE INDEX idx_iae_intervention ON public.intervention_academic_evidence(intervention_id);

-- Enable RLS
ALTER TABLE public.intervention_academic_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Matches parent intervention read access
CREATE POLICY "intervention_academic_evidence_select" ON public.intervention_academic_evidence FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.interventions i
      WHERE i.id = intervention_academic_evidence.intervention_id
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
-- 4. Table: intervention_parent_notifications
-- ============================================================================

CREATE TABLE public.intervention_parent_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id   UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  client_request_id UUID NOT NULL,
  notification_id   UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_by           UUID NOT NULL REFERENCES auth.users(id),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  push_delivered    BOOLEAN,
  push_error        TEXT,
  UNIQUE (intervention_id, client_request_id)
);

CREATE INDEX idx_ipn_intervention ON public.intervention_parent_notifications(intervention_id);

-- Enable RLS
ALTER TABLE public.intervention_parent_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Matches parent intervention read access
CREATE POLICY "intervention_parent_notifications_select" ON public.intervention_parent_notifications FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.interventions i
      WHERE i.id = intervention_parent_notifications.intervention_id
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
