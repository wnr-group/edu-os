-- PTM Phase 1 — tables.
--
-- One row per (meeting, student) — a "PTM day" for a whole section is
-- several rows, not one, so each student gets independent history,
-- feedback, and parent visibility (per the approved plan's granularity
-- decision). teacher_id/section_id are captured at creation and never
-- re-derived from section_assignments/timetable, so history stays accurate
-- even if the class teacher changes or the student transfers sections later.

CREATE TABLE public.ptm_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  section_id uuid NOT NULL REFERENCES public.sections(id),
  subject_id uuid REFERENCES public.subjects(id),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES auth.users(id),
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 15 CHECK (duration_minutes > 0),
  meeting_mode public.ptm_meeting_mode NOT NULL DEFAULT 'in_person',
  location text,
  status public.ptm_meeting_status NOT NULL DEFAULT 'scheduled',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  cancelled_by uuid REFERENCES auth.users(id),
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptm_meetings_school ON public.ptm_meetings(school_id);
CREATE INDEX idx_ptm_meetings_teacher_date ON public.ptm_meetings(teacher_id, scheduled_date);
CREATE INDEX idx_ptm_meetings_student ON public.ptm_meetings(student_id);
CREATE INDEX idx_ptm_meetings_parent ON public.ptm_meetings(parent_id);
CREATE INDEX idx_ptm_meetings_section ON public.ptm_meetings(section_id);

-- Separate from ptm_meetings (mirrors quiz_attempts/quiz_results) — the
-- meeting's schedulable/cancellable state stays independent of the
-- freeform, visibility-gated feedback written about it.
CREATE TABLE public.ptm_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.ptm_meetings(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  summary text NOT NULL,
  visible_to_parent boolean NOT NULL DEFAULT true,
  -- Staff-only. RLS is row-level, not column-level, so Phase 1 deliberately
  -- has no parent SELECT policy on this table at all (see ptm_rls.sql) —
  -- parent access + a column-safe RPC ship together in Phase 2.
  internal_notes text,
  academic_rating smallint CHECK (academic_rating BETWEEN 1 AND 5),
  behavior_rating smallint CHECK (behavior_rating BETWEEN 1 AND 5),
  follow_up_required boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX idx_ptm_feedback_school ON public.ptm_feedback(school_id);
CREATE INDEX idx_ptm_feedback_student ON public.ptm_feedback(student_id);

CREATE OR REPLACE FUNCTION public.touch_ptm_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_touch_ptm_meetings
  BEFORE UPDATE ON public.ptm_meetings
  FOR EACH ROW EXECUTE FUNCTION public.touch_ptm_updated_at();

CREATE TRIGGER trg_touch_ptm_feedback
  BEFORE UPDATE ON public.ptm_feedback
  FOR EACH ROW EXECUTE FUNCTION public.touch_ptm_updated_at();
