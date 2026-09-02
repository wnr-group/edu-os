-- PTM Phase 1 — RPCs. Sole write path for both tables (see ptm_rls.sql).
-- Authorization pattern matches the Testing module's proven RPCs
-- (close_quiz/publish_quiz/push_quiz_to_gradebook): get_my_role() +
-- teaches_section(), not a raw user_roles query — this has been validated
-- end-to-end against real sessions and real HTTP calls this session.
--
-- Reschedule/cancel/complete/feedback are scoped to the meeting's own
-- teacher_id (not "any teacher of the section") — a PTM meeting is a
-- personal 1:1 commitment between one teacher and one parent, unlike a
-- quiz, which is a shared section-level resource.
--
-- schedule_ptm_meeting additionally validates that p_teacher_id is actually
-- associated with p_section_id (class_teacher_id in section_assignments, or
-- appears in timetable) — the same two relationships teaches_section()
-- checks, just parameterized by an arbitrary teacher instead of auth.uid(),
-- since the caller here isn't necessarily the teacher being assigned. This
-- is server-side enforcement, not just a UI dropdown filter, so a client
-- can't accidentally (or otherwise) assign the meeting to an unrelated
-- teacher.
--
-- schedule_ptm_meeting and reschedule_ptm_meeting both reject a date/time in
-- the past — compared as naive timestamps (date + time, no timezone), same
-- wall-clock convention already used by timetable/exam_schedule_slots, so
-- this can't be bypassed by a client sending a stale date/time directly to
-- the RPC.
--
-- record_ptm_feedback is restricted to the meeting's own teacher_id only —
-- unlike the other RPCs, super_admin/school_admin/principal are
-- deliberately NOT authorized to write feedback (they can still read it via
-- ptm_feedback_select's existing RLS policy, unchanged). Feedback is the
-- teacher's own record of the conversation; staff get oversight, not edit
-- rights.

-- ── schedule_ptm_meeting ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.schedule_ptm_meeting(
  p_student_id uuid,
  p_teacher_id uuid,
  p_section_id uuid,
  p_scheduled_date date,
  p_start_time time,
  p_subject_id uuid DEFAULT NULL,
  p_duration_minutes smallint DEFAULT 15,
  p_meeting_mode public.ptm_meeting_mode DEFAULT 'in_person',
  p_location text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_parent_id uuid; v_academic_year_id uuid; v_id uuid;
BEGIN
  SELECT school_id, parent_profile_id INTO v_school_id, v_parent_id
  FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR (public.get_my_role() = 'teacher' AND public.teaches_section(p_section_id))
  , false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    JOIN public.academic_years ay ON ay.id = se.academic_year_id
    WHERE se.student_profile_id = p_student_id
      AND se.section_id = p_section_id
      AND se.is_active = true
      AND ay.status = 'active'
  ) THEN
    RAISE EXCEPTION 'student_not_in_section';
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

  INSERT INTO public.ptm_meetings (
    school_id, academic_year_id, section_id, subject_id, teacher_id, student_id, parent_id,
    scheduled_date, start_time, duration_minutes, meeting_mode, location, created_by
  ) VALUES (
    v_school_id, v_academic_year_id, p_section_id, p_subject_id, p_teacher_id, p_student_id, v_parent_id,
    p_scheduled_date, p_start_time, p_duration_minutes, p_meeting_mode, p_location, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.schedule', 'ptm_meetings', v_id);

  RETURN v_id;
END $$;

-- ── reschedule_ptm_meeting ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reschedule_ptm_meeting(
  p_meeting_id uuid, p_scheduled_date date, p_start_time time, p_duration_minutes smallint DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_teacher_id uuid; v_status public.ptm_meeting_status;
BEGIN
  SELECT school_id, teacher_id, status INTO v_school_id, v_teacher_id, v_status
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR auth.uid() = v_teacher_id
  , false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'not_scheduled'; END IF;
  IF (p_scheduled_date::timestamp + p_start_time) < now()::timestamp THEN
    RAISE EXCEPTION 'meeting_in_past';
  END IF;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  UPDATE public.ptm_meetings
  SET scheduled_date = p_scheduled_date, start_time = p_start_time,
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes)
  WHERE id = p_meeting_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.reschedule', 'ptm_meetings', p_meeting_id);
END $$;

-- ── cancel_ptm_meeting — no time-based restriction (Phase 1 decision) ───
CREATE OR REPLACE FUNCTION public.cancel_ptm_meeting(
  p_meeting_id uuid, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_teacher_id uuid; v_status public.ptm_meeting_status;
BEGIN
  SELECT school_id, teacher_id, status INTO v_school_id, v_teacher_id, v_status
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR auth.uid() = v_teacher_id
  , false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'not_scheduled'; END IF;

  UPDATE public.ptm_meetings
  SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_reason = p_reason
  WHERE id = p_meeting_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.cancel', 'ptm_meetings', p_meeting_id,
          jsonb_build_object('reason', p_reason));
END $$;

-- ── mark_ptm_completed — 'completed' or 'no_show' only ──────────────────
CREATE OR REPLACE FUNCTION public.mark_ptm_completed(
  p_meeting_id uuid, p_status public.ptm_meeting_status
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_teacher_id uuid; v_status public.ptm_meeting_status;
BEGIN
  IF p_status NOT IN ('completed', 'no_show') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT school_id, teacher_id, status INTO v_school_id, v_teacher_id, v_status
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT COALESCE(
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR auth.uid() = v_teacher_id
  , false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'not_scheduled'; END IF;

  UPDATE public.ptm_meetings SET status = p_status WHERE id = p_meeting_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.status_update', 'ptm_meetings', p_meeting_id,
          jsonb_build_object('status', p_status));
END $$;

-- ── record_ptm_feedback — upsert; requires the meeting to be completed ──
CREATE OR REPLACE FUNCTION public.record_ptm_feedback(
  p_meeting_id uuid,
  p_summary text,
  p_visible_to_parent boolean DEFAULT true,
  p_internal_notes text DEFAULT NULL,
  p_academic_rating smallint DEFAULT NULL,
  p_behavior_rating smallint DEFAULT NULL,
  p_follow_up_required boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_teacher_id uuid; v_student_id uuid; v_status public.ptm_meeting_status; v_id uuid;
BEGIN
  SELECT school_id, teacher_id, student_id, status INTO v_school_id, v_teacher_id, v_student_id, v_status
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  -- Deliberately narrower than the other RPCs: only the meeting's own
  -- teacher may write feedback, not super_admin/school_admin/principal.
  IF auth.uid() <> v_teacher_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status NOT IN ('completed', 'no_show') THEN RAISE EXCEPTION 'meeting_not_completed'; END IF;
  IF btrim(COALESCE(p_summary, '')) = '' THEN RAISE EXCEPTION 'summary_required'; END IF;

  INSERT INTO public.ptm_feedback (
    meeting_id, school_id, teacher_id, student_id, summary, visible_to_parent,
    internal_notes, academic_rating, behavior_rating, follow_up_required, created_by
  ) VALUES (
    p_meeting_id, v_school_id, v_teacher_id, v_student_id, p_summary, p_visible_to_parent,
    p_internal_notes, p_academic_rating, p_behavior_rating, p_follow_up_required, auth.uid()
  )
  ON CONFLICT (meeting_id) DO UPDATE SET
    summary = EXCLUDED.summary,
    visible_to_parent = EXCLUDED.visible_to_parent,
    internal_notes = EXCLUDED.internal_notes,
    academic_rating = EXCLUDED.academic_rating,
    behavior_rating = EXCLUDED.behavior_rating,
    follow_up_required = EXCLUDED.follow_up_required,
    edited_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.feedback', 'ptm_feedback', v_id);

  RETURN v_id;
END $$;
