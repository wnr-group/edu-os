-- PTM Phase 4 refinement — bulk slot generation + teacher-clash validation
-- at publish time.
--
-- Generation math (start/end/duration/gap → candidate times) lives entirely
-- client-side, since the UI needs the preview before any server round-trip
-- anyway and staff can deselect individual candidates there. The client
-- sends the exact, already-computed array of start times; this RPC's job is
-- purely to validate and insert each one independently in a single
-- transaction — no duplicate generation logic to keep in sync between
-- client and server.
--
-- New teacher-clash check (added to BOTH publish_ptm_slot and this RPC):
-- a slot can no longer be published if it overlaps an existing 'scheduled'
-- ptm_meetings row for that teacher — direct, bulk, or booking-origin, it
-- doesn't matter which. Cancelled/no-show/completed meetings free that time
-- again, so they're excluded (status = 'scheduled' only). This is a new,
-- proactive publish-time check; book_ptm_slot's own insert into
-- ptm_meetings still fires the existing, unmodified clash trigger
-- regardless — this doesn't replace that, it just catches the same class
-- of problem earlier, before a parent ever sees the (unbookable) offer.
--
-- Two open (unbooked) slot offers are still allowed to overlap each other —
-- unchanged from the original Phase 4 design; only a real meeting blocks a
-- new offer.

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
    SELECT 1 FROM public.ptm_meetings m
    WHERE m.teacher_id = p_teacher_id AND m.scheduled_date = p_scheduled_date AND m.status = 'scheduled'
      AND (m.start_time, m.start_time + make_interval(mins => m.duration_minutes))
          OVERLAPS (p_start_time, p_start_time + make_interval(mins => p_duration_minutes))
  ) THEN
    RAISE EXCEPTION 'This slot overlaps a meeting this teacher already has scheduled.';
  END IF;

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

-- ── bulk_publish_ptm_slots ────────────────────────────────────────────────
-- Authorization/section checks run once (section and teacher don't change
-- per row within one batch); each requested start time is then validated
-- and inserted independently, so one bad time never blocks the rest —
-- lenient/partial, same posture as bulk_cancel_ptm_meetings. Returns one row
-- per requested time: slot_id set on success, skipped_reason set on skip.
CREATE OR REPLACE FUNCTION public.bulk_publish_ptm_slots(
  p_section_id uuid,
  p_scheduled_date date,
  p_start_times time[],
  p_duration_minutes smallint,
  p_teacher_id uuid,
  p_subject_id uuid DEFAULT NULL,
  p_meeting_mode public.ptm_meeting_mode DEFAULT 'in_person',
  p_location text DEFAULT NULL
) RETURNS TABLE(start_time time, slot_id uuid, skipped_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_academic_year_id uuid;
  v_start time;
  v_id uuid;
  v_created_ids uuid[] := '{}';
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

  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF p_start_times IS NULL OR array_length(p_start_times, 1) IS NULL THEN RAISE EXCEPTION 'no_slots_requested'; END IF;
  -- Server-side backstop for the UI's own 60-slot cap — never trust the
  -- client's cap alone for something that inserts rows in a loop.
  IF array_length(p_start_times, 1) > 60 THEN RAISE EXCEPTION 'too_many_slots'; END IF;

  SELECT id INTO v_academic_year_id FROM public.academic_years WHERE school_id = v_school_id AND status = 'active';
  IF v_academic_year_id IS NULL THEN RAISE EXCEPTION 'no_active_academic_year'; END IF;

  FOREACH v_start IN ARRAY p_start_times LOOP
    IF (p_scheduled_date::timestamp + v_start) < now()::timestamp THEN
      start_time := v_start; slot_id := NULL; skipped_reason := 'meeting_in_past';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ptm_meetings m
      WHERE m.teacher_id = p_teacher_id AND m.scheduled_date = p_scheduled_date AND m.status = 'scheduled'
        AND (m.start_time, m.start_time + make_interval(mins => m.duration_minutes))
            OVERLAPS (v_start, v_start + make_interval(mins => p_duration_minutes))
    ) THEN
      start_time := v_start; slot_id := NULL; skipped_reason := 'teacher_has_conflicting_meeting';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ptm_availability_slots s
      WHERE s.teacher_id = p_teacher_id AND s.section_id = p_section_id
        AND s.scheduled_date = p_scheduled_date AND s.start_time = v_start AND s.status = 'open'
    ) THEN
      start_time := v_start; slot_id := NULL; skipped_reason := 'slot_already_exists';
      RETURN NEXT;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.ptm_availability_slots (
        school_id, academic_year_id, section_id, subject_id, teacher_id,
        scheduled_date, start_time, duration_minutes, meeting_mode, location, created_by
      ) VALUES (
        v_school_id, v_academic_year_id, p_section_id, p_subject_id, p_teacher_id,
        p_scheduled_date, v_start, p_duration_minutes, p_meeting_mode, p_location, auth.uid()
      ) RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      start_time := v_start; slot_id := NULL; skipped_reason := 'slot_already_exists';
      RETURN NEXT;
      CONTINUE;
    END;

    v_created_ids := array_append(v_created_ids, v_id);
    start_time := v_start; slot_id := v_id; skipped_reason := NULL;
    RETURN NEXT;
  END LOOP;

  -- One summary audit row per batch (only if at least one slot was actually
  -- created), same shape as bulk_schedule_ptm_meetings's own audit entry.
  IF array_length(v_created_ids, 1) > 0 THEN
    INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
    VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.slots_bulk_published', 'ptm_availability_slots', p_section_id,
            jsonb_build_object('slot_ids', v_created_ids, 'count', array_length(v_created_ids, 1), 'scheduled_date', p_scheduled_date));
  END IF;

  RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_publish_ptm_slots(
  uuid, date, time[], smallint, uuid, uuid, public.ptm_meeting_mode, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_publish_ptm_slots(
  uuid, date, time[], smallint, uuid, uuid, public.ptm_meeting_mode, text
) TO authenticated;

-- ── Parent visibility widened: open AND booked (§2 of the refinement) ────
-- A booked slot carries no student/parent identity of its own — only
-- booked_meeting_id, which a different parent still can't dereference
-- (ptm_meetings_select's is_parent_of_student check blocks that
-- separately). So a parent seeing "this time is booked" never reveals by
-- whom. Withdrawn stays excluded — it was never a real offer to begin with.
DROP POLICY IF EXISTS "ptm_slots_select" ON public.ptm_availability_slots;
CREATE POLICY "ptm_slots_select" ON public.ptm_availability_slots FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    public.feature_enabled(school_id, 'ptm')
    AND school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('school_admin', 'principal')
  )
  OR (public.feature_enabled(school_id, 'ptm') AND teacher_id = auth.uid())
  OR (
    public.feature_enabled(school_id, 'ptm')
    AND status IN ('open', 'booked')
    AND EXISTS (
      SELECT 1 FROM public.student_enrollments se
      JOIN public.student_profiles sp ON sp.id = se.student_profile_id
      WHERE se.section_id = ptm_availability_slots.section_id
        AND se.academic_year_id = ptm_availability_slots.academic_year_id
        AND se.is_active = true
        AND sp.parent_profile_id = auth.uid()
    )
  )
);
