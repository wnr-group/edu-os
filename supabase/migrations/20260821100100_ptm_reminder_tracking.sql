-- PTM Phase 2 — reminder de-duplication.
--
-- Same guard pattern as exams.datesheet_last_notified_at: a nullable
-- timestamp set once a reminder is actually sent, so the daily cron
-- (send-ptm-reminders) can filter WHERE reminder_sent_at IS NULL and never
-- double-send even if re-triggered. reschedule_ptm_meeting resets it to
-- NULL whenever the date/time actually changes, so a moved meeting gets a
-- fresh day-before reminder for its new time instead of silently getting
-- none (or a stale one for the old time).

ALTER TABLE public.ptm_meetings ADD COLUMN reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.reschedule_ptm_meeting(
  p_meeting_id uuid, p_scheduled_date date, p_start_time time, p_duration_minutes smallint DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_teacher_id uuid; v_status public.ptm_meeting_status;
BEGIN
  SELECT school_id, teacher_id, status INTO v_school_id, v_teacher_id, v_status
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF NOT (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR auth.uid() = v_teacher_id
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'not_scheduled'; END IF;
  IF (p_scheduled_date::timestamp + p_start_time) < now()::timestamp THEN
    RAISE EXCEPTION 'meeting_in_past';
  END IF;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  UPDATE public.ptm_meetings
  SET scheduled_date = p_scheduled_date, start_time = p_start_time,
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      reminder_sent_at = NULL
  WHERE id = p_meeting_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'ptm.reschedule', 'ptm_meetings', p_meeting_id);
END $$;
