-- Testing (quizzes) — sub-project #6. Enums only; tables follow in the next
-- migration. See docs/superpowers/specs/2026-08-14-testing-design.md.

CREATE TYPE public.quiz_mode AS ENUM ('async', 'live');
CREATE TYPE public.quiz_status AS ENUM ('draft', 'scheduled', 'open', 'closed');
CREATE TYPE public.quiz_question_type AS ENUM ('mcq', 'true_false', 'short_answer');
CREATE TYPE public.quiz_attempt_status AS ENUM ('in_progress', 'submitted', 'graded');
CREATE TYPE public.quiz_grading_status AS ENUM ('auto', 'pending_manual_grade', 'manually_graded');
