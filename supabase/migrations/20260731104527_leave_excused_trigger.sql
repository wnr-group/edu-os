-- Named trg_zz_... deliberately, to sort after any other same-timing trigger
-- on attendance_records (Postgres runs same-event triggers alphabetically) —
-- this must have the final say over `status`. Fires for EVERY write path to
-- this table (web's mark_attendance RPC, mobile's direct upsert, bulk edits),
-- since triggers attach to the table, not to a specific caller.
CREATE OR REPLACE FUNCTION public.enforce_excused_on_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leave_requests lr
    WHERE lr.student_id = NEW.student_id
      AND lr.status = 'approved'
      AND NEW.date BETWEEN lr.from_date AND lr.to_date
  ) THEN
    NEW.status := 'excused';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_zz_enforce_excused ON public.attendance_records;
CREATE TRIGGER trg_zz_enforce_excused BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_excused_on_leave();