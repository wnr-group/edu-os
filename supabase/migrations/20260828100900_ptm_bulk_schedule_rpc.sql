-- PTM Phase 3 — bulk scheduling.
--
-- Reuses schedule_ptm_meeting's validation shape (section→school lookup,
-- feature flag, teacher-section association, past-date guard). Authorized
-- for admin/principal (+ super_admin) for any permitted section, OR a
-- teacher bulk-scheduling their own section — mirrors schedule_ptm_meeting's
-- teacher branch (role='teacher' AND teaches_section(p_section_id)), plus
-- one extra constraint bulk mode needs that the single-meeting RPC doesn't:
-- p_teacher_id = auth.uid(). Bulk mode has no per-row teacher picker for a
-- teacher caller, so without this a teacher could pass a co-teacher's id
-- and bulk-schedule meetings "as" someone else who also teaches the same
-- section — the UI never offers that (the teacher selector is hidden for
-- teacher callers), but the RPC must not rely on the UI to enforce it.
--
-- One ptm_meetings row per actively enrolled student in the section, with
-- consecutive slots (student N gets p_start_time + N * p_duration_minutes).
-- Each INSERT still fires trg_check_ptm_meeting_clash (Phase 1) — and since
-- later statements in the same transaction see earlier statements' writes,
-- slot N's clash check also sees the rows already inserted for students
-- 0..N-1 earlier in this same call, not just pre-existing data. So a
-- same-teacher time overlap within one bulk run is caught exactly like a
-- clash against a pre-existing meeting.
--
-- One summary audit_log row per call, not one per meeting — a bulk-created
-- PTM day is a single admin action, not N independent ones. Each created
-- row still carries its own created_by/created_at for per-meeting history.
CREATE OR REPLACE FUNCTION public.bulk_schedule_ptm_meetings(
  p_section_id uuid,
  p_scheduled_date date,
  p_start_time time,
  p_duration_minutes smallint,
  p_teacher_id uuid,
  p_subject_id uuid DEFAULT NULL,
  p_meeting_mode public.ptm_meeting_mode DEFAULT 'in_person',
  p_location text DEFAULT NULL
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_academic_year_id uuid;
  v_slot_time time;
  v_meeting_ids uuid[] := '{}';
  v_meeting_id uuid;
  v_count int := 0;
  r record;
BEGIN
  SELECT school_id INTO v_school_id FROM public.sections WHERE id = p_section_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  -- Admin/principal for any permitted section, OR a teacher bulk-scheduling
  -- their own section as themselves.
  --
  -- Wrapped in COALESCE(..., false): get_my_role() reads the app.role GUC,
  -- which is NULL whenever scope_pre_request() can't resolve a valid
  -- school/role for the caller (e.g. a missing/mismatched x-school-id or
  -- x-active-role header). A bare `IF NOT (a OR b)` would then evaluate to
  -- `IF NOT NULL`, which PL/pgSQL treats as false and silently skips the
  -- RAISE — the check would no-op instead of denying. Forcing the whole
  -- condition through COALESCE fails closed on that NULL case instead.
  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR (public.get_my_role() = 'teacher' AND p_teacher_id = auth.uid() AND public.teaches_section(p_section_id)),
    false
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Redundant with teaches_section() for the teacher branch above (a
  -- teacher who passed that check is by definition associated with the
  -- section), but this is still the check that matters for admin/principal,
  -- who choose an arbitrary p_teacher_id — it verifies THAT teacher (not the
  -- caller) is actually assigned to the section.
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

  FOR r IN
    SELECT se.student_profile_id AS student_id, sp.parent_profile_id AS parent_id
    FROM public.student_enrollments se
    JOIN public.student_profiles sp ON sp.id = se.student_profile_id
    WHERE se.section_id = p_section_id AND se.academic_year_id = v_academic_year_id AND se.is_active = true
    ORDER BY se.roll_number NULLS LAST, sp.full_name
  LOOP
    v_slot_time := p_start_time + make_interval(mins => (v_count * p_duration_minutes));

    INSERT INTO public.ptm_meetings (
      school_id, academic_year_id, section_id, subject_id, teacher_id, student_id, parent_id,
      scheduled_date, start_time, duration_minutes, meeting_mode, location, created_by
    ) VALUES (
      v_school_id, v_academic_year_id, p_section_id, p_subject_id, p_teacher_id, r.student_id, r.parent_id,
      p_scheduled_date, v_slot_time, p_duration_minutes, p_meeting_mode, p_location, auth.uid()
    ) RETURNING id INTO v_meeting_id;

    v_meeting_ids := array_append(v_meeting_ids, v_meeting_id);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no_active_students';
  END IF;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.bulk_schedule', 'ptm_meetings', p_section_id,
          jsonb_build_object('meeting_ids', v_meeting_ids, 'count', v_count, 'scheduled_date', p_scheduled_date));

  RETURN v_meeting_ids;
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_schedule_ptm_meetings(
  uuid, date, time, smallint, uuid, uuid, public.ptm_meeting_mode, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_schedule_ptm_meetings(
  uuid, date, time, smallint, uuid, uuid, public.ptm_meeting_mode, text
) TO authenticated;
