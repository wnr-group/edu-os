-- 20260903110000_update_student_profile_identity.sql
CREATE OR REPLACE FUNCTION public.update_student_profile_identity(
  p_profile_id uuid, p_full_name text, p_email text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school uuid := public.get_my_school_id();
BEGIN
  IF public.get_my_role() NOT IN ('super_admin','school_admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- the target must be a student in the caller's own school
  IF NOT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.profile_id = p_profile_id AND sp.school_id = v_school
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.profiles
  SET full_name = p_full_name,
      email = COALESCE(NULLIF(btrim(p_email), ''), email)
  WHERE id = p_profile_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.update_student_profile_identity(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_student_profile_identity(uuid, text, text) TO authenticated;
