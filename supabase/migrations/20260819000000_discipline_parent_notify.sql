-- EDUOS-2026-08-18-16: Teacher Complaints -> Parent Visibility.
--
-- Root cause: discipline_records.parent_notified existed since the original
-- schema (20240001000008_discipline.sql) but was never set by any code path,
-- and no notifications row was ever created when a teacher logged an
-- incident. The parent-side data path (RLS, More -> Discipline Records) was
-- already correct and retrieved records fine when navigated to directly —
-- but nothing ever told the parent a new complaint existed, so they had no
-- reason to go looking. This wires the already-scaffolded notification
-- column to the app's existing notifications table (already read by
-- more.tsx's Notifications list and parent-counts.tsx's unread badge), the
-- same mechanism homework/leave/attendance notifications already use —
-- no new app code, no new edge function, no new UI.
CREATE OR REPLACE FUNCTION public.notify_parent_of_discipline_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent_id uuid;
  v_student_name text;
BEGIN
  SELECT sp.parent_profile_id, sp.full_name INTO v_parent_id, v_student_name
  FROM public.student_profiles sp
  WHERE sp.id = NEW.student_id;

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO public.notifications (school_id, user_id, student_id, title, body, type)
    VALUES (
      NEW.school_id, v_parent_id, NEW.student_id,
      'Discipline record added',
      'A new discipline record has been logged for ' || COALESCE(v_student_name, 'your child') || '.',
      'discipline_record'
    );
    NEW.parent_notified := true;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_parent_discipline ON public.discipline_records;
CREATE TRIGGER trg_notify_parent_discipline BEFORE INSERT ON public.discipline_records
  FOR EACH ROW EXECUTE FUNCTION public.notify_parent_of_discipline_record();
