-- Testing (quizzes) — Live Quiz mode, Phase 1a: schema. Extends the existing
-- async/scheduled implementation; every new column is nullable/defaulted so
-- current async rows and behavior are untouched. See
-- docs/superpowers/specs/2026-08-14-testing-design.md and the Live Quiz
-- product decisions (auto-advance server-validated; late-join disabled by
-- default; late-join denominator excludes missed questions; exclusion keeps
-- answers for audit but is filtered from aggregate results; 10s-600s timer).

CREATE TYPE public.quiz_live_status AS ENUM ('not_started', 'in_progress', 'ended');
CREATE TYPE public.quiz_participant_status AS ENUM ('joined', 'excluded');
CREATE TYPE public.quiz_blocker_reason AS ENUM ('technical', 'connectivity', 'device', 'not_available', 'other');
CREATE TYPE public.quiz_blocker_status AS ENUM ('open', 'acknowledged', 'resolved');

-- ── quizzes: live-session state (all nullable/defaulted — no-op for async) ──
ALTER TABLE public.quizzes
  ADD COLUMN live_status public.quiz_live_status,
  ADD COLUMN live_current_question_index smallint,
  ADD COLUMN live_question_started_at timestamptz,
  ADD COLUMN live_late_join_allowed boolean NOT NULL DEFAULT false;

-- ── quiz_questions: per-question timer, live-mode only ──────────────────────
ALTER TABLE public.quiz_questions
  ADD COLUMN time_limit_seconds smallint,
  ADD CONSTRAINT quiz_questions_time_limit_range
    CHECK (time_limit_seconds IS NULL OR time_limit_seconds BETWEEN 10 AND 600);

-- ── quiz_attempts: late-join denominator marker + exclusion flag ───────────
ALTER TABLE public.quiz_attempts
  ADD COLUMN joined_at_question_index smallint,
  ADD COLUMN excluded boolean NOT NULL DEFAULT false;

-- ── quiz_live_participants — waiting-room / join tracking, deliberately
-- separate from quiz_attempts so the async attempt state machine is
-- untouched (an attempt is only created once the student actually starts
-- answering, via start_quiz_attempt) ────────────────────────────────────────
CREATE TABLE public.quiz_live_participants (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  status public.quiz_participant_status not null default 'joined',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, student_id)
);
CREATE INDEX idx_quiz_live_participants_quiz ON public.quiz_live_participants(quiz_id);

ALTER TABLE public.quiz_live_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_live_participants_select" ON public.quiz_live_participants FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin', 'principal')
     OR public.teaches_student(student_id)
     OR public.is_parent_of_student(student_id)
  ))
);
-- No write policy — all writes via join_live_quiz / exclude_participant RPCs.
GRANT SELECT ON public.quiz_live_participants TO authenticated;

-- ── quiz_blocker_reports — simple issue/report workflow, not a chat ────────
CREATE TABLE public.quiz_blocker_reports (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  reason public.quiz_blocker_reason not null,
  message text,
  status public.quiz_blocker_status not null default 'open',
  reported_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz
);
CREATE INDEX idx_quiz_blocker_reports_quiz ON public.quiz_blocker_reports(quiz_id);

ALTER TABLE public.quiz_blocker_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_blocker_reports_select" ON public.quiz_blocker_reports FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin', 'principal')
     OR public.teaches_student(student_id)
     OR public.is_parent_of_student(student_id)
  ))
);
-- No write policy — all writes via report_quiz_blocker / acknowledge_blocker RPCs.
GRANT SELECT ON public.quiz_blocker_reports TO authenticated;
