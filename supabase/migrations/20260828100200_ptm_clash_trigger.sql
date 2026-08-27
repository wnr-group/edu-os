-- PTM Phase 1 — teacher double-booking guard.
--
-- Mirrors check_exam_slot_clash() in 20260729104235_exam_schedule.sql: a
-- BEFORE trigger with a human-readable RAISE EXCEPTION, not a bare EXCLUDE
-- constraint, so the teacher gets told which meeting conflicts. Only checks
-- teacher-vs-teacher overlap — a parent/student having two overlapping
-- meetings with two different teachers is a soft UI warning, not a hard
-- block (see plan §11 edge cases), since it isn't a resource conflict.

CREATE OR REPLACE FUNCTION public.check_ptm_meeting_clash()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_conflict record;
BEGIN
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;

  SELECT m.id, m.start_time, m.duration_minutes INTO v_conflict
  FROM public.ptm_meetings m
  WHERE m.teacher_id = NEW.teacher_id
    AND m.scheduled_date = NEW.scheduled_date
    AND m.status = 'scheduled'
    AND m.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (m.start_time, m.start_time + make_interval(mins => m.duration_minutes))
        OVERLAPS
        (NEW.start_time, NEW.start_time + make_interval(mins => NEW.duration_minutes))
  LIMIT 1;

  IF v_conflict.id IS NOT NULL THEN
    RAISE EXCEPTION 'This teacher already has a meeting at % (% min) on that date', v_conflict.start_time, v_conflict.duration_minutes;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_check_ptm_meeting_clash
  BEFORE INSERT OR UPDATE OF teacher_id, scheduled_date, start_time, duration_minutes, status
  ON public.ptm_meetings
  FOR EACH ROW EXECUTE FUNCTION public.check_ptm_meeting_clash();
