-- PTM Phase 4 refinement — prevent duplicate published slots.
--
-- Exact match only, on (teacher, section, date, start_time) — no overlap
-- prevention at publish time, deliberately: two open slots at overlapping
-- (but not identical) times are still allowed, since only one can ever be
-- booked and the existing trg_check_ptm_meeting_clash trigger is already
-- the source of truth for a real teacher-time conflict the moment either
-- one is actually claimed by book_ptm_slot.
--
-- Partial unique index (status = 'open' only) — same idiom already used in
-- this schema by idx_academic_years_one_active. Scoping to 'open' means a
-- withdrawn or booked slot never permanently blocks republishing the exact
-- same time later.
CREATE UNIQUE INDEX idx_ptm_slots_no_duplicate_open
  ON public.ptm_availability_slots (teacher_id, section_id, scheduled_date, start_time)
  WHERE status = 'open';

-- publish_ptm_slot gets an explicit pre-check (friendly message) plus a
-- caught unique_violation as a defense-in-depth backstop for the rare
-- concurrent-publish race — either path surfaces the same message text to
-- the caller, never a raw constraint-name error.
CREATE OR REPLACE FUNCTION public.publish_ptm_slot(
  p_section_id uuid,
  p_scheduled_date date,
  p_start_time time,
  p_duration_minutes smallint,
  p_teacher_id uuid,
  p_subject_id uuid DEFAULT NULL,
  p_meeting_mode public.ptm_meeting_mode DEFAULT 'in_person',
  p_location text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_academic_year_id uuid;
  v_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.sections WHERE id = p_section_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR (public.get_my_role() = 'teacher' AND p_teacher_id = auth.uid() AND public.teaches_section(p_section_id)),
    false
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.section_assignments sa
    JOIN public.academic_years ay ON ay.id = sa.academic_year_id
    WHERE sa.section_id = p_section_id AND sa.class_teacher_id = p_teacher_id AND ay.status = 'active'
    UNION ALL
    SELECT 1 FROM public.timetable tt
    JOIN public.academic_years ay ON ay.id = tt.academic_year_id
    WHERE tt.section_id = p_section_id AND tt.teacher_id = p_teacher_id AND ay.status = 'active'
  ) THEN
    RAISE EXCEPTION 'teacher_not_associated_with_section';
  END IF;

  IF (p_scheduled_date::timestamp + p_start_time) < now()::timestamp THEN
    RAISE EXCEPTION 'meeting_in_past';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  SELECT id INTO v_academic_year_id FROM public.academic_years WHERE school_id = v_school_id AND status = 'active';
  IF v_academic_year_id IS NULL THEN RAISE EXCEPTION 'no_active_academic_year'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.ptm_availability_slots s
    WHERE s.teacher_id = p_teacher_id AND s.section_id = p_section_id
      AND s.scheduled_date = p_scheduled_date AND s.start_time = p_start_time
      AND s.status = 'open'
  ) THEN
    RAISE EXCEPTION 'This time slot is already available for this teacher and section.';
  END IF;

  BEGIN
    INSERT INTO public.ptm_availability_slots (
      school_id, academic_year_id, section_id, subject_id, teacher_id,
      scheduled_date, start_time, duration_minutes, meeting_mode, location, created_by
    ) VALUES (
      v_school_id, v_academic_year_id, p_section_id, p_subject_id, p_teacher_id,
      p_scheduled_date, p_start_time, p_duration_minutes, p_meeting_mode, p_location, auth.uid()
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This time slot is already available for this teacher and section.';
  END;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.slot_published', 'ptm_availability_slots', v_id);

  RETURN v_id;
END $$;
