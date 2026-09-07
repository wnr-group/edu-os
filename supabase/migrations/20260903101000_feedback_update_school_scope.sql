-- supabase/migrations/20260903101000_feedback_update_school_scope.sql
--
-- PR #25 review (Comment #20's "issue #30", verified independently):
-- feedback_update (20260728123200_rls_retrofit_feedback.sql, already on
-- main) has no school_id condition at all for the school_admin/principal/
-- teacher branch — unlike feedback_select right above it in the same file,
-- which correctly scopes those same three roles to their own school. Any
-- staff member in ANY school could UPDATE a feedback row belonging to ANY
-- OTHER school (as long as that school has the feedback feature enabled),
-- including setting responded_by to themselves. That's load-bearing for
-- resolveFeedback's isResponder check, which trusts responded_by as proof
-- the caller wrote the response.
--
-- Cannot edit 20260728123200 directly — it's already on main. This
-- migration redefines the same policy with two additions: the same-school
-- scoping feedback_select already has, and a WITH CHECK (previously
-- absent entirely) constraining what an UPDATE is allowed to set
-- responded_by to.
DROP POLICY IF EXISTS "feedback_update" ON public.feedback;
CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id,'feedback')
      AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
      AND school_id = public.get_my_school_id()
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id,'feedback')
      AND public.get_my_role() IN ('school_admin', 'principal', 'teacher')
      AND school_id = public.get_my_school_id()
      -- responded_by can only ever be cleared or set to the caller's own
      -- id — never forged to name a different user as the responder.
      AND (responded_by IS NULL OR responded_by = auth.uid())
    )
  );
