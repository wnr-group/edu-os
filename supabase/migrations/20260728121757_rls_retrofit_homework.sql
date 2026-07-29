-- homework table
DROP POLICY IF EXISTS "homework_select" ON public.homework;
CREATE POLICY "homework_select" ON public.homework FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'homework') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "homework_write" ON public.homework;
CREATE POLICY "homework_write" ON public.homework FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'homework') AND (
      (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_section(section_id))
    ))
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'homework') AND (
      (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
      OR (public.get_my_role() = 'teacher' AND school_id = public.get_my_school_id() AND public.teaches_section(section_id))
    ))
  );

-- homework_attachments (table rows only — Storage bucket objects NOT gated, see note above)
DROP POLICY IF EXISTS "homework_attachments_select" ON public.homework_attachments;
CREATE POLICY "homework_attachments_select" ON public.homework_attachments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'homework') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "homework_attachments_write" ON public.homework_attachments;
CREATE POLICY "homework_attachments_write" ON public.homework_attachments FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'homework') AND public.get_my_role() IN ('school_admin', 'teacher') AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'homework') AND public.get_my_role() IN ('school_admin', 'teacher') AND school_id = public.get_my_school_id())
  );

-- homework_status: SELECT only (no table-level write policy — writes go through RPCs below)
DROP POLICY IF EXISTS "homework_status_select" ON public.homework_status;
CREATE POLICY "homework_status_select" ON public.homework_status FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id,'homework')
      AND school_id = public.get_my_school_id()
      AND (
        public.get_my_role() IN ('school_admin', 'principal', 'teacher')
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = homework_status.student_id
            AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

-- homework_status writes are all SECURITY DEFINER RPCs (migration 048), which
-- bypass RLS entirely — the table-level policy above can't gate them. Add an
-- explicit check inside each RPC instead.
CREATE OR REPLACE FUNCTION public.mark_homework_viewed(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
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
  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  INSERT INTO public.homework_status (homework_id, student_id, school_id, state, viewed_at, done_at)
  VALUES (p_homework_id, p_student_id, public._homework_school(p_homework_id), 'done', now(), now())
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET state = 'done', done_at = now(), viewed_at = COALESCE(public.homework_status.viewed_at, now());
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
  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  SELECT reviewed_at INTO v_reviewed FROM public.homework_status
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
  IF v_reviewed IS NOT NULL THEN
    RAISE EXCEPTION 'already_reviewed';
  END IF;

  UPDATE public.homework_status SET state = 'viewed', done_at = NULL
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_homework(
  p_homework_id uuid, p_student_id uuid, p_rating public.homework_rating, p_comment text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_state public.homework_state;
BEGIN
  IF NOT public.teaches_homework_section(p_homework_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  SELECT state INTO v_state FROM public.homework_status
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
  IF v_state IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'not_done';
  END IF;

  UPDATE public.homework_status
  SET rating = p_rating, teacher_comment = NULLIF(btrim(p_comment), ''),
      reviewed_at = now(), reviewed_by = auth.uid()
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
END;
$$;