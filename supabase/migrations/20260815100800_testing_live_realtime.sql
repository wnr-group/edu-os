-- Testing (quizzes) — Live Quiz mode, Phase 3: Realtime wiring.
--
-- Supabase Realtime's postgres_changes evaluates RLS using ONLY the
-- connecting user's JWT (auth.uid()) — it never runs PostgREST's
-- db-pre-request hook (scope_pre_request, migration 20240001000038), so the
-- app.role / app.school_id GUCs that get_my_role()/get_my_school_id() read
-- are never set on a Realtime connection. This is the exact same gap
-- already hit and fixed for Storage in migrations 20240001000051/52
-- ("...does NOT run PostgREST's db-pre-request hook..."); the fix here
-- follows the same auth.uid()-direct-against-user_roles pattern.
--
-- quizzes gets an ADDITIONAL permissive SELECT policy (RLS policies are
-- OR'd together) rather than a rewrite — the two existing policies
-- (quizzes_select_staff, quizzes_select_parent) are untouched and keep
-- serving every already-verified PostgREST/RPC read path exactly as before.
-- quiz_live_participants / quiz_blocker_reports are brand new from this same
-- Live Quiz work and have no other consumer yet, so their single existing
-- policy is replaced outright rather than duplicated.

CREATE POLICY "quizzes_select_realtime" ON public.quizzes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin' AND ur.is_active)
  OR (
    public.feature_enabled(school_id, 'testing')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = quizzes.school_id AND ur.is_active
        AND ur.role IN ('school_admin', 'principal', 'teacher')
    )
  )
  OR (
    public.feature_enabled(school_id, 'testing')
    AND status <> 'draft'
    AND public.quiz_visible_to_parent(id)
  )
);

DROP POLICY IF EXISTS "quiz_live_participants_select" ON public.quiz_live_participants;
CREATE POLICY "quiz_live_participants_select" ON public.quiz_live_participants FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin' AND ur.is_active)
  OR (
    public.feature_enabled(school_id, 'testing')
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.school_id = quiz_live_participants.school_id AND ur.is_active
          AND ur.role IN ('school_admin', 'principal')
      )
      OR public.teaches_student(student_id)
      OR public.is_parent_of_student(student_id)
    )
  )
);

DROP POLICY IF EXISTS "quiz_blocker_reports_select" ON public.quiz_blocker_reports;
CREATE POLICY "quiz_blocker_reports_select" ON public.quiz_blocker_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin' AND ur.is_active)
  OR (
    public.feature_enabled(school_id, 'testing')
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.school_id = quiz_blocker_reports.school_id AND ur.is_active
          AND ur.role IN ('school_admin', 'principal')
      )
      OR public.teaches_student(student_id)
      OR public.is_parent_of_student(student_id)
    )
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_live_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_blocker_reports;
