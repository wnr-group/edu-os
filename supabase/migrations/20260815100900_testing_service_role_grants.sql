-- Testing (quizzes) — service_role grants.
--
-- Confirmed via direct REST testing: send-quiz-notification's service-role
-- admin client got 403 "permission denied for table quizzes" reading a row
-- that plainly existed — every quiz-related table created in this session
-- (Phases 1 and 3) never received the grant service_role needs. This is the
-- exact same class of bug as 20260815100500_testing_grants.sql (new tables
-- get no default grants in this project — confirmed there for `authenticated`,
-- now also confirmed for `service_role`), just previously invisible because
-- nothing used the service-role client against these tables until this
-- edge function. Every other table this project already reads via
-- service-role (student_profiles, profiles, notifications, user_roles,
-- section_assignments, timetable, student_enrollments) already has it —
-- inherited from the original bootstrap, predating this feature.
--
-- service_role already bypasses RLS by design (it's the trusted, server-only
-- key), so — unlike the authenticated grants, which mirror each table's RLS
-- shape — this grants full privileges uniformly across all nine tables.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.quizzes,
  public.quiz_questions,
  public.quiz_options,
  public.quiz_assignments,
  public.quiz_attempts,
  public.quiz_answers,
  public.quiz_results,
  public.quiz_live_participants,
  public.quiz_blocker_reports
TO service_role;
