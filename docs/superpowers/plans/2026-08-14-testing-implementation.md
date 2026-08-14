# Testing — Live &amp; Async Quizzes with Auto-Grading (implementation plan)

> Companion to the design doc `docs/superpowers/specs/2026-08-14-testing-design.md` (read that first — it has the
> product decisions this plan just executes) and the prototype `stitch-designs/eduos-v2/testing-quiz-prototype.html`.
> Migration filenames below use placeholder timestamps `202608XX_*` — at build time, use the next real sequential
> `supabase migration new` timestamps (per the repo's D4 convention: migrations are sequential, RLS predicate is
> `school_id = public.get_my_school_id()`, policy naming is `"<table>_select" | "<table>_write"`).

**Do NOT implement yet** — this plan is for review. Steps use checkbox (`- [ ]`) syntax for tracking once approved.

---

## File map

```
supabase/migrations/
├── 202608XX_testing_enums.sql
├── 202608XX_testing_tables.sql
├── 202608XX_testing_totals_trigger.sql
├── 202608XX_testing_rpcs_authoring.sql
├── 202608XX_testing_rpcs_attempt.sql
├── 202608XX_testing_rpcs_grading.sql
├── 202608XX_testing_rls.sql
├── 202608XX_testing_cron.sql
└── 202608XX_testing_feature_flag_gates.sql   -- gatesTables backfill note only; registry.ts is the source

packages/shared/src/features/registry.ts       -- populate gatesTables/gatesFunctions on the existing `testing` entry

apps/web/
├── lib/nav-config.ts                          -- add "Testing" nav item, teacher + admin + principal, gated
└── app/(school)/
    ├── teacher/testing/
    │   ├── page.tsx                           -- quiz list
    │   ├── quiz-list-table.tsx
    │   ├── [quizId]/edit/page.tsx              -- builder shell (tabs, client component)
    │   ├── [quizId]/edit/details-tab.tsx
    │   ├── [quizId]/edit/questions-tab.tsx
    │   ├── [quizId]/edit/availability-tab.tsx
    │   ├── [quizId]/edit/assign-tab.tsx
    │   ├── [quizId]/edit/preview-publish-tab.tsx
    │   ├── [quizId]/results/page.tsx           -- submissions & results
    │   └── [quizId]/results/[studentId]/page.tsx
    └── admin/testing/page.tsx                  -- read-only school-wide view, reuses teacher components

apps/mobile/
├── lib/testing.ts                              -- data functions (mirrors lib/homework.ts, lib/exam-schedule.ts)
└── app/(parent)/testing/
    ├── index.tsx                               -- quiz list for the active child
    ├── [quizId].tsx                             -- details/instructions
    ├── [quizId]/attempt.tsx                     -- take quiz
    └── [quizId]/result.tsx
```

---

## Task 1 — Enums &amp; core tables

**Files:** `202608XX_testing_enums.sql`, `202608XX_testing_tables.sql`

- [ ] **Step 1: Enums**
```sql
CREATE TYPE public.quiz_mode AS ENUM ('async', 'live');
CREATE TYPE public.quiz_status AS ENUM ('draft', 'scheduled', 'open', 'closed');
CREATE TYPE public.quiz_question_type AS ENUM ('mcq', 'true_false', 'short_answer');
CREATE TYPE public.quiz_attempt_status AS ENUM ('in_progress', 'submitted', 'graded');
CREATE TYPE public.quiz_grading_status AS ENUM ('auto', 'pending_manual_grade', 'manually_graded');
```

- [ ] **Step 2: `quizzes`, `quiz_questions`, `quiz_options`**
```sql
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
  question_count smallint not null default 0,      -- maintained by trigger, Task 2
  total_points numeric(6,2) not null default 0,     -- maintained by trigger, Task 2
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
```

- [ ] **Step 3: `quiz_assignments`, `quiz_attempts`, `quiz_answers`, `quiz_results`**
```sql
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
-- hot path for the force-submit cron
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
```

- [ ] **Step 4: Push migrations, verify all 7 tables exist, RLS not yet enabled.**
- [ ] **Step 5: Commit.**

---

## Task 2 — Denormalized totals trigger

Keeps `quizzes.question_count`/`total_points` in sync so parent screens never need to read `quiz_questions` (design
doc §3/D-T5 — parents get no direct access to question rows at all).

**Files:** `202608XX_testing_totals_trigger.sql`

- [ ] **Step 1:**
```sql
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
```
- [ ] **Step 2: Push, verify inserting/deleting a question updates `quizzes.question_count`/`total_points`.**
- [ ] **Step 3: Commit.**

---

## Task 3 — Authoring RPCs (draft → publish, lock after attempts)

**Files:** `202608XX_testing_rpcs_authoring.sql`

- [ ] **Step 1: `publish_quiz` — validates before flipping status, locks question edits (edge case §6.5 of the
  design doc).**
```sql
CREATE OR REPLACE FUNCTION public.publish_quiz(p_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_status public.quiz_status;
  v_question_count int; v_bad_mcq int;
BEGIN
  SELECT school_id, section_id, status, question_count INTO v_school_id, v_section_id, v_status, v_question_count
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin','principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'already_published'; END IF;
  IF v_question_count = 0 THEN RAISE EXCEPTION 'no_questions'; END IF;

  -- every mcq/true_false question must have exactly one correct option
  SELECT count(*) INTO v_bad_mcq FROM public.quiz_questions q
  WHERE q.quiz_id = p_quiz_id AND q.type IN ('mcq','true_false')
    AND (SELECT count(*) FROM public.quiz_options o WHERE o.question_id = q.id AND o.is_correct) <> 1;
  IF v_bad_mcq > 0 THEN RAISE EXCEPTION 'invalid_correct_answers'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quiz_assignments WHERE quiz_id = p_quiz_id) THEN
    INSERT INTO public.quiz_assignments (quiz_id, school_id, class_id, section_id)
    SELECT p_quiz_id, v_school_id, class_id, v_section_id FROM public.quizzes WHERE id = p_quiz_id;
  END IF;

  UPDATE public.quizzes
  SET status = CASE WHEN opens_at IS NULL OR opens_at <= now() THEN 'open' ELSE 'scheduled' END,
      updated_at = now()
  WHERE id = p_quiz_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.publish', 'quizzes', p_quiz_id);
END $$;
GRANT EXECUTE ON FUNCTION public.publish_quiz(uuid) TO authenticated;
```
Question/option INSERT/UPDATE/DELETE RLS (Task 5) additionally requires `status = 'draft'` — belt-and-braces with
this RPC's own check, since a teacher could otherwise edit questions directly against the table.

- [ ] **Step 2: `push_quiz_to_gradebook` — D-T6, rejects until fully graded.**
```sql
CREATE OR REPLACE FUNCTION public.push_quiz_to_gradebook(p_quiz_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_section_id uuid; v_academic_year_id uuid; v_title text; v_status public.quiz_status;
  v_pending int; v_exam_id uuid;
BEGIN
  SELECT school_id, section_id, academic_year_id, title, status
    INTO v_school_id, v_section_id, v_academic_year_id, v_title, v_status
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin','principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'closed' THEN RAISE EXCEPTION 'not_closed'; END IF;

  SELECT count(*) INTO v_pending FROM public.quiz_answers a
  JOIN public.quiz_attempts t ON t.id = a.attempt_id
  WHERE t.quiz_id = p_quiz_id AND a.grading_status = 'pending_manual_grade';
  IF v_pending > 0 THEN RAISE EXCEPTION 'grading_incomplete'; END IF;

  INSERT INTO public.exams (school_id, academic_year_id, name, start_date, end_date)
  VALUES (v_school_id, v_academic_year_id, v_title, current_date, current_date)
  RETURNING id INTO v_exam_id;

  INSERT INTO public.exam_results (school_id, exam_id, student_id, subject_id, marks_obtained, max_marks, teacher_id)
  SELECT v_school_id, v_exam_id, r.student_id, q.subject_id, r.total_points, r.max_points, auth.uid()
  FROM public.quiz_results r JOIN public.quizzes q ON q.id = r.quiz_id
  WHERE r.quiz_id = p_quiz_id AND r.fully_graded;

  UPDATE public.quizzes SET exam_id = v_exam_id, pushed_to_gradebook_at = now() WHERE id = p_quiz_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.push_to_gradebook', 'quizzes', p_quiz_id,
          jsonb_build_object('exam_id', v_exam_id));

  RETURN v_exam_id;
END $$;
GRANT EXECUTE ON FUNCTION public.push_quiz_to_gradebook(uuid) TO authenticated;
```
- [ ] **Step 3: Push, commit.**

---

## Task 4 — Attempt RPCs (start, answer, submit, get-for-attempt, force-submit)

**Files:** `202608XX_testing_rpcs_attempt.sql`

- [ ] **Step 1: `get_quiz_for_attempt` — question/option text only, `is_correct` never selected (D-T5).**
```sql
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(p_attempt_id uuid)
RETURNS TABLE (
  question_id uuid, prompt text, type public.quiz_question_type, points smallint, order_index smallint,
  option_id uuid, option_text text, option_order smallint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid;
BEGIN
  SELECT student_id INTO v_student_id FROM public.quiz_attempts WHERE id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT q.id, q.prompt, q.type, q.points, q.order_index, o.id, o.option_text, o.order_index
  FROM public.quiz_attempts a
  JOIN public.quiz_questions q ON q.quiz_id = a.quiz_id
  LEFT JOIN public.quiz_options o ON o.question_id = q.id
  WHERE a.id = p_attempt_id
  ORDER BY q.order_index, o.order_index;
END $$;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid) TO authenticated;
```

- [ ] **Step 2: `start_quiz_attempt` — window/attempts_allowed checks, server clock only.**
```sql
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid, p_student_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_status public.quiz_status; v_opens timestamptz; v_closes timestamptz;
  v_attempts_allowed smallint; v_section_id uuid; v_next_attempt smallint; v_id uuid;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT school_id, status, opens_at, closes_at, attempts_allowed, section_id
    INTO v_school_id, v_status, v_opens, v_closes, v_attempts_allowed, v_section_id
  FROM public.quizzes WHERE id = p_quiz_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'testing') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF v_status NOT IN ('open') THEN RAISE EXCEPTION 'not_open'; END IF;
  IF v_opens IS NOT NULL AND now() < v_opens THEN RAISE EXCEPTION 'not_open_yet'; END IF;
  IF v_closes IS NOT NULL AND now() > v_closes THEN RAISE EXCEPTION 'closed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    WHERE qa.quiz_id = p_quiz_id AND se.student_profile_id = p_student_id
  ) THEN RAISE EXCEPTION 'not_assigned'; END IF;

  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_next_attempt
  FROM public.quiz_attempts WHERE quiz_id = p_quiz_id AND student_id = p_student_id;
  IF v_next_attempt > v_attempts_allowed THEN RAISE EXCEPTION 'no_attempts_remaining'; END IF;

  -- resume an existing in_progress attempt instead of starting a new one
  SELECT id INTO v_id FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND status = 'in_progress';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.quiz_attempts (quiz_id, school_id, student_id, attempt_number, created_by)
  VALUES (p_quiz_id, v_school_id, p_student_id, v_next_attempt, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid, uuid) TO authenticated;
```

- [ ] **Step 3: `save_quiz_answer` — upsert, in_progress + within-window only.**
```sql
CREATE OR REPLACE FUNCTION public.save_quiz_answer(
  p_attempt_id uuid, p_question_id uuid, p_selected_option_id uuid, p_short_text text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid; v_status public.quiz_attempt_status; v_school_id uuid;
BEGIN
  SELECT student_id, status, school_id INTO v_student_id, v_status, v_school_id
  FROM public.quiz_attempts WHERE id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'attempt_closed'; END IF;

  INSERT INTO public.quiz_answers (attempt_id, question_id, school_id, selected_option_id, short_answer_text, answered_at)
  VALUES (p_attempt_id, p_question_id, v_school_id, p_selected_option_id, NULLIF(btrim(p_short_text), ''), now())
  ON CONFLICT (attempt_id, question_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        short_answer_text = EXCLUDED.short_answer_text,
        answered_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.save_quiz_answer(uuid, uuid, uuid, text) TO authenticated;
```

- [ ] **Step 4: `submit_quiz_attempt` — the auto-grade core.**
```sql
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_attempt_id uuid, p_auto boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid; v_status public.quiz_attempt_status; v_quiz_id uuid; v_school_id uuid;
DECLARE v_has_pending boolean;
BEGIN
  SELECT student_id, status, quiz_id, school_id INTO v_student_id, v_status, v_quiz_id, v_school_id
  FROM public.quiz_attempts WHERE id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT p_auto AND NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'already_submitted'; END IF;

  -- auto-grade objective answers
  UPDATE public.quiz_answers a
  SET is_correct = o.is_correct,
      points_awarded = CASE WHEN o.is_correct THEN q.points ELSE 0 END,
      grading_status = 'auto'
  FROM public.quiz_questions q
  LEFT JOIN public.quiz_options o ON o.id = a.selected_option_id
  WHERE a.attempt_id = p_attempt_id AND a.question_id = q.id AND q.type IN ('mcq','true_false');

  UPDATE public.quiz_answers a
  SET grading_status = 'pending_manual_grade'
  FROM public.quiz_questions q
  WHERE a.attempt_id = p_attempt_id AND a.question_id = q.id AND q.type = 'short_answer'
    AND a.grading_status = 'auto';

  UPDATE public.quiz_attempts
  SET status = 'submitted', submitted_at = now(), auto_submitted = p_auto
  WHERE id = p_attempt_id;

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_answers WHERE attempt_id = p_attempt_id AND grading_status = 'pending_manual_grade'
  ) INTO v_has_pending;

  INSERT INTO public.quiz_results (attempt_id, quiz_id, student_id, school_id, total_points, max_points, percentage, passed, fully_graded)
  SELECT
    p_attempt_id, v_quiz_id, v_student_id, v_school_id,
    COALESCE(sum(a.points_awarded), 0),
    qz.total_points,
    CASE WHEN qz.total_points > 0 THEN round(COALESCE(sum(a.points_awarded), 0) / qz.total_points * 100, 2) ELSE 0 END,
    CASE WHEN qz.pass_mark_pct IS NULL THEN NULL
         ELSE (CASE WHEN qz.total_points > 0 THEN COALESCE(sum(a.points_awarded), 0) / qz.total_points * 100 ELSE 0 END) >= qz.pass_mark_pct END,
    NOT v_has_pending
  FROM public.quiz_answers a
  JOIN public.quizzes qz ON qz.id = v_quiz_id
  WHERE a.attempt_id = p_attempt_id
  GROUP BY qz.total_points, qz.pass_mark_pct
  ON CONFLICT (attempt_id) DO UPDATE SET
    total_points = EXCLUDED.total_points, max_points = EXCLUDED.max_points,
    percentage = EXCLUDED.percentage, passed = EXCLUDED.passed,
    fully_graded = EXCLUDED.fully_graded, computed_at = now();

  IF NOT v_has_pending THEN
    UPDATE public.quiz_attempts SET status = 'graded' WHERE id = p_attempt_id;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, boolean) TO authenticated;
```

- [ ] **Step 5: `force_submit_expired_attempts` — called by pg_cron only (no client grant).**
```sql
CREATE OR REPLACE FUNCTION public.force_submit_expired_attempts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.id FROM public.quiz_attempts a
    JOIN public.quizzes q ON q.id = a.quiz_id
    WHERE a.status = 'in_progress'
      AND (
        (q.closes_at IS NOT NULL AND now() > q.closes_at)
        OR now() > a.started_at + make_interval(secs => q.duration_seconds)
      )
  LOOP
    PERFORM public.submit_quiz_attempt(r.id, true);
  END LOOP;
END $$;
-- deliberately NOT granted to `authenticated` — invoked only by the cron job below (Task 7), owner privilege only.
```
- [ ] **Step 6: Push, commit.**

---

## Task 5 — Grading RPC

**Files:** `202608XX_testing_rpcs_grading.sql`

- [ ] **Step 1: `grade_short_answer` — teacher marks a pending short-answer, recomputes the result.**
```sql
CREATE OR REPLACE FUNCTION public.grade_short_answer(p_answer_id uuid, p_points numeric, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt_id uuid; v_question_id uuid; v_max_points smallint; v_section_id uuid; v_school_id uuid;
  v_total numeric; v_max numeric; v_pct numeric; v_pass smallint; v_pending boolean; v_quiz_id uuid; v_student_id uuid;
BEGIN
  SELECT a.attempt_id, a.question_id, q.points, qz.section_id, a.school_id, qz.id
    INTO v_attempt_id, v_question_id, v_max_points, v_section_id, v_school_id, v_quiz_id
  FROM public.quiz_answers a
  JOIN public.quiz_questions q ON q.id = a.question_id
  JOIN public.quizzes qz ON qz.id = q.quiz_id
  WHERE a.id = p_answer_id;
  IF v_attempt_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.teaches_section(v_section_id) OR public.get_my_role() IN ('school_admin','principal')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_points < 0 OR p_points > v_max_points THEN RAISE EXCEPTION 'points_out_of_range'; END IF;

  UPDATE public.quiz_answers
  SET points_awarded = p_points, is_correct = (p_points = v_max_points),
      grading_status = 'manually_graded', graded_by = auth.uid(), graded_at = now()
  WHERE id = p_answer_id;

  SELECT student_id INTO v_student_id FROM public.quiz_attempts WHERE id = v_attempt_id;

  SELECT COALESCE(sum(points_awarded), 0), qz.total_points, qz.pass_mark_pct
    INTO v_total, v_max, v_pass
  FROM public.quiz_answers a JOIN public.quizzes qz ON qz.id = v_quiz_id
  WHERE a.attempt_id = v_attempt_id
  GROUP BY qz.total_points, qz.pass_mark_pct;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.quiz_answers WHERE attempt_id = v_attempt_id AND grading_status = 'pending_manual_grade'
  ) INTO v_pending;
  v_pct := CASE WHEN v_max > 0 THEN round(v_total / v_max * 100, 2) ELSE 0 END;

  UPDATE public.quiz_results
  SET total_points = v_total, percentage = v_pct,
      passed = CASE WHEN v_pass IS NULL THEN NULL ELSE v_pct >= v_pass END,
      fully_graded = v_pending, computed_at = now()
  WHERE attempt_id = v_attempt_id;

  IF v_pending THEN
    UPDATE public.quiz_attempts SET status = 'graded' WHERE id = v_attempt_id;
  END IF;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'testing.grade_short_answer', 'quiz_answers', p_answer_id,
          jsonb_build_object('points', p_points, 'note', p_note));
END $$;
GRANT EXECUTE ON FUNCTION public.grade_short_answer(uuid, numeric, text) TO authenticated;
```
- [ ] **Step 2: Push, commit.**

---

## Task 6 — RLS

**Files:** `202608XX_testing_rls.sql`

- [ ] **Step 1: Enable RLS on all 7 tables.**
```sql
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: `quizzes` — staff full access; separate parent read (published only, own child's section).**
```sql
CREATE POLICY "quizzes_select_staff" ON public.quizzes FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quizzes_select_parent" ON public.quizzes FOR SELECT USING (
  public.feature_enabled(school_id, 'testing')
  AND status <> 'draft'
  AND EXISTS (
    SELECT 1 FROM public.quiz_assignments qa
    JOIN public.student_enrollments se ON se.section_id = qa.section_id AND se.is_active
    JOIN public.student_profiles sp ON sp.id = se.student_profile_id
    WHERE qa.quiz_id = quizzes.id AND sp.parent_profile_id = auth.uid()
  )
);
CREATE POLICY "quizzes_write" ON public.quizzes FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
) WITH CHECK (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
);
```

- [ ] **Step 3: `quiz_questions` — staff only, write locked to draft quizzes.**
```sql
CREATE POLICY "quiz_questions_select" ON public.quiz_questions FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quiz_questions_write" ON public.quiz_questions FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal')
           OR EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND public.teaches_section(qz.section_id)))
      AND EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND qz.status = 'draft'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.quizzes qz WHERE qz.id = quiz_questions.quiz_id AND qz.status = 'draft')
);
-- quiz_options mirrors quiz_questions_write exactly (via question_id -> quiz_id -> status='draft'),
-- but NO parent/student SELECT policy at all — see get_quiz_for_attempt / get_quiz_review (Task 4/7).
CREATE POLICY "quiz_options_select_staff" ON public.quiz_options FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quiz_options_write" ON public.quiz_options FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (public.feature_enabled(school_id, 'testing') AND school_id = public.get_my_school_id()
      AND EXISTS (
        SELECT 1 FROM public.quiz_questions q JOIN public.quizzes qz ON qz.id = q.quiz_id
        WHERE q.id = quiz_options.question_id AND qz.status = 'draft'
          AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(qz.section_id))
      ))
);
```

- [ ] **Step 4: `quiz_assignments` — staff only (never read directly by parents; see `quizzes_select_parent`).**
```sql
CREATE POLICY "quiz_assignments_select" ON public.quiz_assignments FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND public.get_my_role() IN ('school_admin','principal','teacher'))
);
CREATE POLICY "quiz_assignments_write" ON public.quiz_assignments FOR ALL USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id()
      AND (public.get_my_role() IN ('school_admin','principal') OR public.teaches_section(section_id)))
);
```

- [ ] **Step 5: `quiz_attempts` / `quiz_answers` / `quiz_results` — SELECT-only, deny-by-default writes (mirrors
  `leave_requests` / `homework_status` exactly).**
```sql
CREATE POLICY "quiz_attempts_select" ON public.quiz_attempts FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin','principal')
     OR public.teaches_student(student_id)
     OR public.is_parent_of_student(student_id)
  ))
);
CREATE POLICY "quiz_answers_select" ON public.quiz_answers FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND EXISTS (
        SELECT 1 FROM public.quiz_attempts t WHERE t.id = quiz_answers.attempt_id AND (
          public.get_my_role() IN ('school_admin','principal')
          OR public.teaches_student(t.student_id)
          OR (public.is_parent_of_student(t.student_id) AND t.status IN ('submitted','graded'))
        )
  ))
);
CREATE POLICY "quiz_results_select" ON public.quiz_results FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin','principal')
     OR public.teaches_student(student_id)
     OR public.is_parent_of_student(student_id)
  ))
);
-- no INSERT/UPDATE/DELETE policies on any of the three — all writes go through
-- start_quiz_attempt / save_quiz_answer / submit_quiz_attempt / grade_short_answer / force_submit_expired_attempts.
```
Note the `quiz_answers_select` parent branch requires `t.status IN ('submitted','graded')` — a parent can never read
their own child's `quiz_answers` rows while `in_progress` (there's nothing to protect there since it's their own
selections, but it keeps the policy consistent with "answers are read through the attempt lifecycle, not mid-quiz
polling" and avoids a client building its own review UI from raw answer rows before `submit_quiz_attempt` has run).

- [ ] **Step 6: Push, run an RLS isolation test per table (per master spec §9 — a second school's data must be
  invisible; a parent of a different student must get zero rows). Commit.**

---

## Task 7 — `get_quiz_review` (post-grading answer review, D-T5)

**Files:** append to `202608XX_testing_rpcs_attempt.sql`

- [ ] **Step 1:**
```sql
CREATE OR REPLACE FUNCTION public.get_quiz_review(p_attempt_id uuid)
RETURNS TABLE (
  question_id uuid, prompt text, points smallint,
  selected_option_id uuid, selected_text text, is_correct boolean, points_awarded numeric,
  correct_option_id uuid, correct_text text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student_id uuid; v_quiz_id uuid; v_show boolean; v_status public.quiz_attempt_status;
BEGIN
  SELECT t.student_id, t.quiz_id, t.status, qz.show_answers_after_close
    INTO v_student_id, v_quiz_id, v_status, v_show
  FROM public.quiz_attempts t JOIN public.quizzes qz ON qz.id = t.quiz_id
  WHERE t.id = p_attempt_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_parent_of_student(v_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status <> 'graded' OR NOT v_show THEN RAISE EXCEPTION 'review_not_available'; END IF;

  RETURN QUERY
  SELECT q.id, q.prompt, q.points,
         a.selected_option_id, so.option_text, a.is_correct, a.points_awarded,
         co.id, co.option_text
  FROM public.quiz_questions q
  JOIN public.quiz_answers a ON a.question_id = q.id AND a.attempt_id = p_attempt_id
  LEFT JOIN public.quiz_options so ON so.id = a.selected_option_id
  LEFT JOIN public.quiz_options co ON co.question_id = q.id AND co.is_correct
  WHERE q.quiz_id = v_quiz_id
  ORDER BY q.order_index;
END $$;
GRANT EXECUTE ON FUNCTION public.get_quiz_review(uuid) TO authenticated;
```
- [ ] **Step 2: Push, commit.**

---

## Task 8 — Cron: force-submit expired attempts

**Files:** `202608XX_testing_cron.sql`

No edge function or Vault secret needed (§design doc D-T7) — this is pure DB mutation, unlike the SMS/push reminder
crons that call out.

- [ ] **Step 1:**
```sql
SELECT cron.schedule(
  'testing-force-submit-expired',
  '*/5 * * * *',   -- every 5 minutes; tight enough that a student never sees a stale "in progress" quiz for long
  $$SELECT public.force_submit_expired_attempts()$$
);
```
- [ ] **Step 2: Push, verify the job appears in `cron.job`. Commit.**

---

## Task 9 — Feature registry

**Files:** `packages/shared/src/features/registry.ts`

- [ ] **Step 1:** update the existing `testing` entry:
```ts
testing: {
  key: "testing",
  label: "Testing",
  description: "Live or async quizzes with auto-grading.",
  category: "Operations",
  defaultOn: false,
  status: "existing",   // flip from "new" once shipped
  gatesTables: ["quizzes", "quiz_questions", "quiz_options", "quiz_assignments", "quiz_attempts", "quiz_answers", "quiz_results"],
  gatesFunctions: [],    // no edge functions in v1 — cron calls the RPC directly (Task 8)
},
```
- [ ] **Step 2: Commit.**

---

## Task 10 — Web: teacher quiz list + builder

**Files:** see File map. Follow existing patterns exactly — no new form library, no data-fetching library:
- List page = Server Component reading `quizzes` (join `subjects`/`sections`) + `<ModuleUnavailable>` when
  `feature_enabled` is false (mirror `admin/exams/page.tsx`).
- Builder = one route with a `"use client"` tab shell (mirrors the prototype's `.btabs`), each tab a controlled
  form; writes call `createClient()` directly (mirror `add-exam-form.tsx`), then `router.refresh()`.
- Questions tab = split panel (list + add-question drawer), mirrors `exam-schedule-web.html`'s slot-list-plus-drawer
  structure already built in `datesheet-builder.tsx`/`add-paper-drawer.tsx` — reuse that component shape.
- Nav entry in `nav-config.ts`: `{ key: "testing", ... }` under teacher + admin + principal nav trees, feature-gated.

- [ ] **Step 1–8:** (broken out per file at build time — deferred to the actual implementation session; this plan
  fixes the architecture, not every JSX line.)

## Task 11 — Web: submissions, results, manual grading

- [ ] Submissions page: reads `quiz_attempts` + `quiz_results` for a quiz, KPI row (submitted count, avg score, avg
  time, pending-grade count), table → student detail.
- [ ] Student detail: reads `quiz_answers` via `quiz_attempts`, renders per-question breakdown; short-answer rows
  render the `grade_short_answer` inline form (mirrors the prototype's `.gradebox`).

## Task 12 — Mobile: parent quiz list, details, attempt, result

**Files:** see File map.
- `lib/testing.ts`: `loadQuizzesForChild(studentId)`, `loadQuizDetails(quizId)`, `startAttempt`, `getQuizForAttempt`,
  `saveAnswer`, `submitAttempt`, `getResult`, `getReview` — thin wrappers over the RPCs/`quizzes` SELECT, mirroring
  `lib/homework.ts`'s shape.
- List screen reads the already-selected child from `useActiveContext()` (no new picker state — D-T2).
- Attempt screen: on mount calls `start_quiz_attempt`, then `get_quiz_for_attempt`; local timer computed from
  `started_at` + `duration_seconds` returned alongside (client countdown is UX only, per D-T7); `save_quiz_answer`
  fires on each selection (debounced), not batched at submit — so a dropped connection mid-quiz loses at most one
  answer, not the whole attempt.
- Result screen: `get_result` (a thin `quiz_results` read) always available once graded; `get_quiz_review` called
  only if `quizzes.show_answers_after_close` (surfaced in the `loadQuizDetails` response).

- [ ] **Step 1–7:** (per-screen breakdown deferred to the implementation session, same as Task 10.)

---

## Definition of done (per master spec §9, applied to this module)

- [ ] Every new table carries `school_id`, RLS enabled, policies present, isolation test passing (Task 6).
- [ ] Every write RPC checks `feature_enabled()` + role/ownership; sensitive ones (publish, grade, push-to-gradebook)
      write `audit_log`.
- [ ] `testing` entry in the feature registry has `gatesTables` populated and `status: "existing"`.
- [ ] Nav item added for teacher + admin + principal (web only — no mobile teacher surface for authoring, matches
      D-T1).
- [ ] Mobile write path (`save_quiz_answer`) is called per-answer, not batched, so a network drop loses at most one
      answer.
- [ ] No secrets, no new Realtime usage, no new edge function — this module ships entirely on RPCs + one `pg_cron`
      entry.
- [ ] Manual QA: publish a quiz → take it as two different students (one full run, one abandoned mid-way past
      `closes_at`, confirm the cron force-submits it) → grade the short answer → confirm `push_quiz_to_gradebook`
      creates correct `exam_results` rows and is rejected before grading completes.
