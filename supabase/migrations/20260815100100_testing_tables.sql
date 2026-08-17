-- Testing (quizzes) — sub-project #6. Core tables + the question-count/points
-- sync trigger. RLS and RPCs land in later migrations (mirrors leave/kyc/
-- admission: tables first, RLS + RPCs as their own reviewable migrations).
-- See docs/superpowers/specs/2026-08-14-testing-design.md and
-- docs/superpowers/plans/2026-08-14-testing-implementation.md (Tasks 1-2).

CREATE TABLE public.quizzes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id),
  subject_id uuid not null references public.subjects(id),
  class_id uuid not null references public.classes(id),
  section_id uuid not null references public.sections(id),
  created_by uuid not null references auth.users(id),
  title text not null,
  instructions text,
  mode public.quiz_mode not null default 'async',
  status public.quiz_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  duration_seconds integer not null check (duration_seconds > 0),
  attempts_allowed smallint not null default 1 check (attempts_allowed between 1 and 5),
  shuffle_questions boolean not null default false,
  pass_mark_pct smallint check (pass_mark_pct between 0 and 100),
  show_answers_after_close boolean not null default false,
  question_count smallint not null default 0,      -- maintained by trg_sync_quiz_totals below
  total_points numeric(6,2) not null default 0,     -- maintained by trg_sync_quiz_totals below
  pushed_to_gradebook_at timestamptz,
  exam_id uuid references public.exams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at is null or closes_at is null or closes_at > opens_at)
);
CREATE INDEX idx_quizzes_school_id ON public.quizzes(school_id);
CREATE INDEX idx_quizzes_section_status ON public.quizzes(section_id, status);

CREATE TABLE public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  type public.quiz_question_type not null,
  prompt text not null,
  points smallint not null default 1 check (points > 0),
  order_index smallint not null,
  short_answer_rubric text,
  created_at timestamptz not null default now(),
  unique (quiz_id, order_index)
);
CREATE INDEX idx_quiz_questions_quiz_id ON public.quiz_questions(quiz_id);

CREATE TABLE public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  order_index smallint not null,
  unique (question_id, order_index)
);
CREATE INDEX idx_quiz_options_question_id ON public.quiz_options(question_id);

CREATE TABLE public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  section_id uuid not null references public.sections(id),
  created_at timestamptz not null default now(),
  unique (quiz_id, section_id)
);
CREATE INDEX idx_quiz_assignments_section ON public.quiz_assignments(section_id);

CREATE TABLE public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  attempt_number smallint not null default 1,
  status public.quiz_attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  created_by uuid not null references auth.users(id),
  unique (quiz_id, student_id, attempt_number)
);
CREATE INDEX idx_quiz_attempts_student ON public.quiz_attempts(student_id);
CREATE INDEX idx_quiz_attempts_quiz ON public.quiz_attempts(quiz_id);
-- hot path for the force-submit cron (Task 8)
CREATE INDEX idx_quiz_attempts_in_progress ON public.quiz_attempts(status) WHERE status = 'in_progress';

CREATE TABLE public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id),
  school_id uuid not null references public.schools(id) on delete cascade,
  selected_option_id uuid references public.quiz_options(id),
  short_answer_text text,
  is_correct boolean,
  points_awarded numeric(5,2),
  grading_status public.quiz_grading_status not null default 'auto',
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
CREATE INDEX idx_quiz_answers_attempt ON public.quiz_answers(attempt_id);

CREATE TABLE public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.quiz_attempts(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  total_points numeric(6,2) not null default 0,
  max_points numeric(6,2) not null default 0,
  percentage numeric(5,2) not null default 0,
  passed boolean,
  fully_graded boolean not null default false,
  computed_at timestamptz not null default now()
);
CREATE INDEX idx_quiz_results_student ON public.quiz_results(student_id);
CREATE INDEX idx_quiz_results_quiz ON public.quiz_results(quiz_id);

-- Keeps quizzes.question_count/total_points in sync so parent-facing screens
-- never need direct read access to quiz_questions (design doc D-T5).
CREATE OR REPLACE FUNCTION public.sync_quiz_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_quiz_id uuid;
BEGIN
  v_quiz_id := COALESCE(NEW.quiz_id, OLD.quiz_id);
  UPDATE public.quizzes SET
    question_count = (SELECT count(*) FROM public.quiz_questions WHERE quiz_id = v_quiz_id),
    total_points   = (SELECT COALESCE(sum(points), 0) FROM public.quiz_questions WHERE quiz_id = v_quiz_id),
    updated_at = now()
  WHERE id = v_quiz_id;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_sync_quiz_totals
  AFTER INSERT OR UPDATE OF points OR DELETE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.sync_quiz_totals();
