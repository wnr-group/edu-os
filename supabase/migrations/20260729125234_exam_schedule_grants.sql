-- The exam_schedule migration created rooms and exam_schedule_slots with RLS
-- enabled and correct policies, but never granted base table-level privileges
-- to `authenticated` — every other table in this project gets that implicitly
-- via a schema-level default, which these two didn't pick up. RLS still
-- governs row-level access exactly as already written; this only satisfies
-- the privilege check that runs before RLS is even evaluated.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_schedule_slots TO authenticated;