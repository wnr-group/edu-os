-- Two active SELECT policies (staff + parent) — both need the gate, or a
-- parent could still read via discipline_parent_select with the module off.
DROP POLICY IF EXISTS "discipline_select" ON public.discipline_records;
CREATE POLICY "discipline_select" ON public.discipline_records FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'discipline') AND public.get_my_role() IN ('school_admin', 'principal', 'teacher') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "discipline_parent_select" ON public.discipline_records;
CREATE POLICY "discipline_parent_select" ON public.discipline_records FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND public.feature_enabled(school_id,'discipline')
    AND student_id IN (
      SELECT id FROM public.student_profiles WHERE parent_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "discipline_write" ON public.discipline_records;
CREATE POLICY "discipline_write" ON public.discipline_records FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'discipline') AND (
      (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_student(student_id))
    ))
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'discipline') AND (
      (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_student(student_id))
    ))
  );