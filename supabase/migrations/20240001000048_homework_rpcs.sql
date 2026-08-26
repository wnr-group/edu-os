-- All homework_status writes flow through these SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = p_student_id
      AND sp.parent_profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id uuid, p_school_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = p_student_id
      AND sp.parent_profile_id = auth.uid()
      AND sp.school_id = p_school_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent_of_student(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.teaches_homework_section(p_homework_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_section uuid;
  v_school  uuid;
  v_year    uuid;
BEGIN
  SELECT section_id, school_id INTO v_section, v_school
  FROM public.homework WHERE id = p_homework_id;
  IF v_section IS NULL THEN RETURN false; END IF;

  v_year := public.get_active_academic_year(v_school);

  RETURN EXISTS (
    SELECT 1 FROM public.section_assignments sa
    WHERE sa.section_id = v_section
      AND sa.class_teacher_id = auth.uid()
      AND sa.academic_year_id = v_year
  ) OR EXISTS (
    SELECT 1 FROM public.timetable tt
    WHERE tt.section_id = v_section
      AND tt.teacher_id = auth.uid()
      AND tt.academic_year_id = v_year
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._homework_school(p_homework_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT school_id FROM public.homework WHERE id = p_homework_id; $$;

CREATE OR REPLACE FUNCTION public.mark_homework_viewed(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.homework_status (homework_id, student_id, school_id, state, viewed_at)
  VALUES (p_homework_id, p_student_id, public._homework_school(p_homework_id), 'viewed', now())
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET viewed_at = COALESCE(public.homework_status.viewed_at, now());
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_homework_done(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.homework_status (homework_id, student_id, school_id, state, viewed_at, done_at)
  VALUES (p_homework_id, p_student_id, public._homework_school(p_homework_id), 'done', now(), now())
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET state = 'done',
        done_at = now(),
        viewed_at = COALESCE(public.homework_status.viewed_at, now());
END;
$$;

CREATE OR REPLACE FUNCTION public.unmark_homework_done(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_reviewed timestamptz;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT reviewed_at INTO v_reviewed
  FROM public.homework_status
  WHERE homework_id = p_homework_id AND student_id = p_student_id;

  IF v_reviewed IS NOT NULL THEN
    RAISE EXCEPTION 'already_reviewed';
  END IF;

  UPDATE public.homework_status
  SET state = 'viewed', done_at = NULL
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_homework(
  p_homework_id uuid,
  p_student_id  uuid,
  p_rating      public.homework_rating,
  p_comment     text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_state public.homework_state;
BEGIN
  IF NOT public.teaches_homework_section(p_homework_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT state INTO v_state
  FROM public.homework_status
  WHERE homework_id = p_homework_id AND student_id = p_student_id;

  IF v_state IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'not_done';
  END IF;

  UPDATE public.homework_status
  SET rating = p_rating,
      teacher_comment = NULLIF(btrim(p_comment), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_homework_viewed(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_homework_done(uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmark_homework_done(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_homework(uuid, uuid, public.homework_rating, text) TO authenticated;
