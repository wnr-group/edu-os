-- PTM Phase 4 — publish_ptm_slot / withdraw_ptm_slot.
--
-- Authorization mirrors bulk_schedule_ptm_meetings exactly: admin/principal
-- for any permitted section, or a teacher publishing/withdrawing only their
-- own section's slots as themselves (p_teacher_id = auth.uid(), same
-- COALESCE(..., false) fail-closed wrapping as the Phase 3 fix — get_my_role()
-- reads the app.role GUC, which is NULL whenever scope_pre_request() can't
-- resolve a valid school/role, and a bare `IF NOT (...)` would silently skip
-- the RAISE on that NULL instead of denying).
--
-- publish_ptm_slot deliberately does NOT clash-check against other slots or
-- existing meetings — two open slots are allowed to overlap (they're just
-- offers); the existing, unmodified trg_check_ptm_meeting_clash trigger is
-- the single source of truth the moment either one is actually booked (see
-- book_ptm_slot in the next migration).

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

  INSERT INTO public.ptm_availability_slots (
    school_id, academic_year_id, section_id, subject_id, teacher_id,
    scheduled_date, start_time, duration_minutes, meeting_mode, location, created_by
  ) VALUES (
    v_school_id, v_academic_year_id, p_section_id, p_subject_id, p_teacher_id,
    p_scheduled_date, p_start_time, p_duration_minutes, p_meeting_mode, p_location, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.slot_published', 'ptm_availability_slots', v_id);

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.publish_ptm_slot(
  uuid, date, time, smallint, uuid, uuid, public.ptm_meeting_mode, text
) TO authenticated;

-- ── withdraw_ptm_slot — only while still 'open' ─────────────────────────
-- An already-booked slot is a real meeting now; use cancel_ptm_meeting on
-- that meeting instead. Same authorization shape as publish.
CREATE OR REPLACE FUNCTION public.withdraw_ptm_slot(p_slot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_teacher_id uuid; v_status public.ptm_slot_status;
BEGIN
  SELECT school_id, teacher_id, status INTO v_school_id, v_teacher_id, v_status
  FROM public.ptm_availability_slots WHERE id = p_slot_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR (public.get_my_role() = 'teacher' AND auth.uid() = v_teacher_id),
    false
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_status <> 'open' THEN RAISE EXCEPTION 'slot_not_open'; END IF;

  UPDATE public.ptm_availability_slots SET status = 'withdrawn' WHERE id = p_slot_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.slot_withdrawn', 'ptm_availability_slots', p_slot_id);
END $$;

GRANT EXECUTE ON FUNCTION public.withdraw_ptm_slot(uuid) TO authenticated;
