-- Public, no-login verification for a student's Digital ID card. Returns only
-- the minimum info needed to confirm a card is genuine and check its live
-- status — never contact details, DOB, or other student PII.
CREATE OR REPLACE FUNCTION public.verify_student_id_card(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student record;
  v_school record;
  v_enrollment record;
BEGIN
  SELECT sp.id, sp.full_name, sp.photo_url, sp.admission_number, sp.id_card_status, sp.school_id,
         p.full_name AS profile_full_name
  INTO v_student
  FROM public.student_profiles sp
  LEFT JOIN public.profiles p ON p.id = sp.profile_id
  WHERE sp.id = p_student_id;

  IF v_student.id IS NULL THEN RETURN NULL; END IF;

  SELECT id, name, logo_url, is_active INTO v_school
  FROM public.schools WHERE id = v_student.school_id;

  IF v_school.id IS NULL OR NOT v_school.is_active THEN RETURN NULL; END IF;

  SELECT c.name AS class_name, s.name AS section_name INTO v_enrollment
  FROM public.student_enrollments se
  JOIN public.classes c ON c.id = se.class_id
  JOIN public.sections s ON s.id = se.section_id
  WHERE se.student_profile_id = p_student_id AND se.is_active = true
  LIMIT 1;

  RETURN jsonb_build_object(
    'student_name', COALESCE(v_student.profile_full_name, v_student.full_name, 'Student'),
    'photo_url', v_student.photo_url,
    'admission_number', v_student.admission_number,
    'class_name', v_enrollment.class_name,
    'section_name', v_enrollment.section_name,
    'school_name', v_school.name,
    'school_logo_url', v_school.logo_url,
    'status', v_student.id_card_status
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.verify_student_id_card(uuid) TO anon, authenticated;
