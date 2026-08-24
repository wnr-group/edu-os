-- Allow principal to update student_profiles, profiles, and student_enrollments
DROP POLICY IF EXISTS "student_profiles_write" ON public.student_profiles;
CREATE POLICY "student_profiles_write" ON public.student_profiles FOR ALL
  USING (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.get_my_role() IN ('super_admin', 'school_admin', 'principal'));

DROP POLICY IF EXISTS "student_enrollments_write" ON public.student_enrollments;
CREATE POLICY "student_enrollments_write" ON public.student_enrollments FOR ALL
  USING (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id());
