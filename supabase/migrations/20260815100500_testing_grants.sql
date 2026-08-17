-- Testing (quizzes) — missing base table grants. RLS was correct all along,
-- but Postgres checks table-level privileges before RLS ever runs, and
-- these 7 tables never got the `authenticated` grant new tables in this
-- project need explicitly (same bug as rooms/exam_schedule_slots, fixed the
-- same way in 20260729125234_exam_schedule_grants.sql).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes, public.quiz_questions, public.quiz_options, public.quiz_assignments TO authenticated;
GRANT SELECT ON public.quiz_attempts, public.quiz_answers, public.quiz_results TO authenticated;
