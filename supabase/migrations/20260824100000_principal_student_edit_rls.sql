-- Allow principal to update student_profiles and student_enrollments (tenant-scoped)
DROP POLICY IF EXISTS "student_profiles_write" ON public.student_profiles;
CREATE POLICY "student_profiles_write" ON public.student_profiles FOR ALL
  USING (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "student_enrollments_write" ON public.student_enrollments;
CREATE POLICY "student_enrollments_write" ON public.student_enrollments FOR ALL
  USING (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() IN ('super_admin', 'school_admin', 'principal') AND school_id = public.get_my_school_id());

-- Tenant-scoped RPC for updating student profile identity safely without widening profiles_update globally
CREATE OR REPLACE FUNCTION public.update_student_profile_identity(
  p_profile_id uuid,
  p_full_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.get_my_school_id();
BEGIN
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- The target profile must hold an active role in the caller's school
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_profile_id
      AND ur.school_id = v_school
      AND ur.is_active
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.profiles
  SET full_name = p_full_name,
      email = p_email,
      phone = COALESCE(p_phone, phone)
  WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_student_profile_identity(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_profile_identity(uuid, text, text, text) TO authenticated;
