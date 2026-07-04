-- Backfill timetable rows created before the admin form stamped academic_year_id.
-- The web timetable form used to INSERT without academic_year_id, so every
-- admin-created slot landed with academic_year_id = NULL. The mobile teacher
-- app and web teacher views filter timetable by the active academic_year_id,
-- so those slots were invisible everywhere except the raw admin table — which
-- meant teachers could not see (or take attendance for) classes assigned to them.
--
-- This stamps each NULL-year row with its school's active academic year.
-- The timetable unique index is partial (WHERE academic_year_id IS NOT NULL),
-- so NULL rows never collided before; after backfill they must respect
-- UNIQUE(section_id, academic_year_id, day_of_week, period). We therefore
-- remove collisions first — both against already-stamped rows and duplicate
-- NULL rows — before stamping the survivors. Written as standalone statements
-- (no temp table) so it is safe regardless of how the migration runner wraps
-- transactions.

-- 1. Drop NULL rows that would collide with an already-stamped row for the
--    same (section, active year, day, period).
DELETE FROM public.timetable t
WHERE t.academic_year_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.timetable e
    WHERE e.section_id = t.section_id
      AND e.day_of_week = t.day_of_week
      AND e.period = t.period
      AND e.academic_year_id = public.get_active_academic_year(t.school_id)
      AND e.id <> t.id
  );

-- 2. Dedupe NULL rows that map to the same target slot as each other,
--    keeping the lowest id so exactly one survives per slot.
DELETE FROM public.timetable t
WHERE t.academic_year_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.timetable o
    WHERE o.academic_year_id IS NULL
      AND o.section_id = t.section_id
      AND o.day_of_week = t.day_of_week
      AND o.period = t.period
      AND o.id < t.id
  );

-- 3. Stamp the survivors with their school's active academic year.
--    Rows whose school has no active year stay NULL (nothing reads them).
UPDATE public.timetable t
SET academic_year_id = public.get_active_academic_year(t.school_id)
WHERE t.academic_year_id IS NULL
  AND public.get_active_academic_year(t.school_id) IS NOT NULL;
