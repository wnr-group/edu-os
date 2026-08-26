-- supabase/migrations/20260824000001_submit_homework_rpc.sql
--
-- submit_homework(): the sole writer of homework_submissions. Re-derives
-- every piece of authorization/eligibility server-side — never trusts a
-- client-supplied student_id/homework_id/school_id/submitted_by. Atomic by
-- construction: this is one plpgsql function body, so if the internal call
-- to mark_homework_done() raises, Postgres aborts the whole transaction
-- (including the upsert already executed above it) — no explicit
-- transaction control needed or possible inside a function body.

CREATE OR REPLACE FUNCTION public.submit_homework(
  p_homework_id uuid,
  p_student_id  uuid,
  p_file_path   text,
  p_file_name   text,
  p_file_type   text,
  p_file_size   integer
) RETURNS TABLE(submission_id uuid, old_file_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_school_id       uuid;
  v_hw_section      uuid;
  v_hw_class        uuid;
  v_hw_year         uuid;
  v_due_date        date;
  v_student_school  uuid;
  v_student_section uuid;
  v_student_class   uuid;
  v_old_path        text;
  v_submission_id   uuid;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT school_id, section_id, class_id, academic_year_id, due_date
  INTO v_school_id, v_hw_section, v_hw_class, v_hw_year, v_due_date
  FROM public.homework WHERE id = p_homework_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'homework_not_found';
  END IF;

  SELECT school_id, section_id, class_id
  INTO v_student_school, v_student_section, v_student_class
  FROM public.student_enrollments
  WHERE student_profile_id = p_student_id
    AND academic_year_id = v_hw_year
    AND is_active = true;

  IF v_student_school IS DISTINCT FROM v_school_id
     OR v_student_section IS DISTINCT FROM v_hw_section
     OR v_student_class IS DISTINCT FROM v_hw_class THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.feature_enabled(v_school_id, 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  IF CURRENT_DATE > v_due_date THEN
    RAISE EXCEPTION 'deadline_passed';
  END IF;

  IF p_file_type NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
    RAISE EXCEPTION 'invalid_file_type';
  END IF;

  IF p_file_size <= 0 OR p_file_size > 5242880 THEN
    RAISE EXCEPTION 'invalid_file_size';
  END IF;

  -- Capture the previous file_path (if any) before the upsert overwrites it.
  SELECT file_path INTO v_old_path
  FROM public.homework_submissions
  WHERE homework_id = p_homework_id AND student_id = p_student_id;

  INSERT INTO public.homework_submissions
    (school_id, homework_id, student_id, submitted_by, file_path, file_name, file_type, file_size)
  VALUES
    (v_school_id, p_homework_id, p_student_id, auth.uid(), p_file_path, p_file_name, p_file_type, p_file_size)
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET file_path    = EXCLUDED.file_path,
        file_name    = EXCLUDED.file_name,
        file_type    = EXCLUDED.file_type,
        file_size    = EXCLUDED.file_size,
        submitted_by = EXCLUDED.submitted_by,
        submitted_at = now(),
        updated_at   = now()
  RETURNING id INTO v_submission_id;

  PERFORM public.mark_homework_done(p_homework_id, p_student_id);

  RETURN QUERY SELECT v_submission_id, v_old_path;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_homework(uuid, uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_homework(uuid, uuid, text, text, text, integer) TO authenticated;
