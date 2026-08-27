-- PTM Phase 4 — book_ptm_slot. The atomic parent-booking claim.
--
-- Concurrency: step 1 is a single conditional UPDATE ... WHERE status='open'
-- RETURNING. Under Postgres's default READ COMMITTED isolation, an UPDATE
-- takes a row lock the instant it identifies a matching row; a second
-- concurrent caller targeting the same slot blocks until the first commits,
-- then re-evaluates its own WHERE clause against the now-committed value —
-- which no longer matches 'open', so the second UPDATE affects zero rows and
-- RETURNING yields nothing. No SELECT ... FOR UPDATE, advisory lock, or
-- unique constraint is needed; the single-statement UPDATE is the whole
-- mechanism. See the approved Phase 4 plan §04.
--
-- Self-healing: every check below step 1 runs inside the same function call,
-- i.e. the same transaction as the claim. If any of them RAISEs, the entire
-- call rolls back — including the slot UPDATE — so the slot automatically
-- reverts to 'open' with no manual "undo" code. This covers the teacher-time
-- clash (step 7's INSERT still fires the existing, unmodified
-- trg_check_ptm_meeting_clash trigger from Phase 1), the expiry check
-- (step 2), and the duplicate-date check (step 6) alike.
--
-- Duplicate-booking rule (§10 decision 1, revised): step 6 only counts
-- OTHER parent-booked meetings (booking_slot_id IS NOT NULL) for the same
-- child on the same date. A meeting staff already scheduled directly or via
-- bulk scheduling is never counted and never blocks a booking — this rule
-- exists to stop a parent double-booking their own self-service action, not
-- to constrain how staff independently schedule.
CREATE OR REPLACE FUNCTION public.book_ptm_slot(
  p_slot_id uuid,
  p_student_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_slot public.ptm_availability_slots%ROWTYPE;
  v_parent_id uuid;
  v_meeting_id uuid;
BEGIN
  -- Fail-closed COALESCE, same reasoning as publish_ptm_slot's authorization
  -- check: get_my_role() can be NULL, and a bare `IF get_my_role() <> 'parent'`
  -- would evaluate to NULL and silently skip the RAISE.
  IF NOT COALESCE(public.get_my_role() = 'parent', false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- 1. The atomic claim.
  UPDATE public.ptm_availability_slots
  SET status = 'booked'
  WHERE id = p_slot_id AND status = 'open'
  RETURNING * INTO v_slot;

  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  -- 2. Expiry — enforced here, not by a cron job (§10 decision 6). Checked
  -- against the slot's own stored date/time regardless of what status it
  -- happened to still say, so a slot nobody withdrew after its time passed
  -- still can't be booked.
  IF (v_slot.scheduled_date::timestamp + v_slot.start_time) < now()::timestamp THEN
    RAISE EXCEPTION 'slot_expired';
  END IF;

  -- 3.
  IF NOT public.feature_enabled(v_slot.school_id, 'ptm') THEN
    RAISE EXCEPTION 'feature_disabled';
  END IF;

  -- 5. (Numbering matches the approved plan's step order in §03 — step 4,
  -- is_parent_of_student, already ran above before the claim.)
  IF NOT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    WHERE se.student_profile_id = p_student_id
      AND se.section_id = v_slot.section_id
      AND se.academic_year_id = v_slot.academic_year_id
      AND se.is_active = true
  ) THEN
    RAISE EXCEPTION 'student_not_in_section';
  END IF;

  -- 6. Duplicate-per-date — booking-origin meetings only, see header.
  IF EXISTS (
    SELECT 1 FROM public.ptm_meetings m
    WHERE m.student_id = p_student_id
      AND m.scheduled_date = v_slot.scheduled_date
      AND m.status = 'scheduled'
      AND m.booking_slot_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'duplicate_booking_for_date';
  END IF;

  SELECT parent_profile_id INTO v_parent_id FROM public.student_profiles WHERE id = p_student_id;

  -- 7. A completely normal ptm_meetings row — same shape schedule_ptm_meeting
  -- produces, so reschedule/cancel/complete/feedback/visibility all work on
  -- it with zero new code. Still fires trg_check_ptm_meeting_clash.
  INSERT INTO public.ptm_meetings (
    school_id, academic_year_id, section_id, subject_id, teacher_id, student_id, parent_id,
    scheduled_date, start_time, duration_minutes, meeting_mode, location, created_by, booking_slot_id
  ) VALUES (
    v_slot.school_id, v_slot.academic_year_id, v_slot.section_id, v_slot.subject_id, v_slot.teacher_id, p_student_id, v_parent_id,
    v_slot.scheduled_date, v_slot.start_time, v_slot.duration_minutes, v_slot.meeting_mode, v_slot.location, auth.uid(), v_slot.id
  ) RETURNING id INTO v_meeting_id;

  -- 8.
  UPDATE public.ptm_availability_slots SET booked_meeting_id = v_meeting_id WHERE id = p_slot_id;

  -- 9.
  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_slot.school_id, auth.uid(), public.get_my_role(), 'ptm.slot_booked', 'ptm_meetings', v_meeting_id);

  RETURN v_meeting_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.book_ptm_slot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_ptm_slot(uuid, uuid) TO authenticated;
