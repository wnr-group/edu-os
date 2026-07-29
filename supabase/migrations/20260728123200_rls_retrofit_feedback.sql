-- from_user_id branch (author reading their own submission) intentionally NOT
-- gated — if you wrote it, you can always see it, module state notwithstanding.
DROP POLICY IF EXISTS "feedback_select" ON public.feedback;
CREATE POLICY "feedback_select" ON public.feedback FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'feedback') AND public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
    OR (public.feature_enabled(school_id,'feedback') AND public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND to_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "feedback_insert" ON public.feedback;
CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT
  WITH CHECK (public.feature_enabled(school_id,'feedback') AND school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "feedback_update" ON public.feedback;
CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'feedback') AND public.get_my_role() IN ('school_admin', 'principal', 'teacher'))
  );