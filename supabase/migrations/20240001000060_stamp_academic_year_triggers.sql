-- Guarantee academic_year_id is always set on year-scoped rows, at the DB layer.
--
-- Background: several client insert paths (web AND the many per-school mobile
-- builds) omit academic_year_id on tables where the column is nullable. Because
-- year-filtered reads (?eq academic_year_id) then can't see those rows, the data
-- silently vanishes from the UI — this is exactly the timetable loophole that
-- hid teacher assignments and blocked attendance. Patching every call site is
-- fragile: a single new screen (or an old mobile build we can't force-update)
-- reintroduces the gap. So we enforce the invariant once, in the database, where
-- every client — current and future, web and native — is covered.
--
-- Two flavours of BEFORE INSERT trigger:
--   * Section-derived (timetable): a timetable row belongs to the SAME year as
--     its section. Stamping the school's ACTIVE year would be wrong for a row
--     that points at an archived-year section — it would collide in-app with the
--     real active-year section of the same name (the bug migration 058 had to
--     repair). So timetable inherits its section's year.
--   * Active-year (everything else): sections, attendance, homework, discipline,
--     announcements, gallery, feedback, fee_line_items all belong to whichever
--     year is active at insert time.
--
-- Triggers only fire when academic_year_id IS NULL, so callers that set it
-- explicitly (e.g. the new-year wizard seeding a DRAFT/future year) are never
-- overridden.

-- ── Section-derived stamper (timetable) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_year_from_section()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.academic_year_id IS NULL THEN
    SELECT s.academic_year_id INTO NEW.academic_year_id
    FROM public.sections s
    WHERE s.id = NEW.section_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Active-year stamper (all other year-scoped tables) ──────────────────────
CREATE OR REPLACE FUNCTION public.stamp_active_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.academic_year_id IS NULL THEN
    NEW.academic_year_id := public.get_active_academic_year(NEW.school_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ── Wire up triggers ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_stamp_year ON public.timetable;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.timetable
  FOR EACH ROW EXECUTE FUNCTION public.stamp_year_from_section();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.sections;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.attendance_records;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.homework;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.discipline_records;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.discipline_records
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.announcements;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.school_gallery;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.school_gallery
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.feedback;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

DROP TRIGGER IF EXISTS trg_stamp_year ON public.fee_line_items;
CREATE TRIGGER trg_stamp_year BEFORE INSERT ON public.fee_line_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_active_year();

-- ── Backfill existing NULL-year rows ────────────────────────────────────────
-- sections predates the year column, so any pre-migration-030 section is NULL.
-- Stamp them with the school's active year (a bare section has no better anchor;
-- unlike timetable it has no section to inherit from) so they reappear in the
-- classes list and mobile app.
--
-- Guard (the 058 lesson): sections are resolved BY NAME in the wizard/app, so if
-- an active-year section with the same class + name already exists, stamping the
-- orphan would surface a visible duplicate. In that case leave it NULL — that is
-- the current (hidden) state, so no regression, and no phantom twin.
UPDATE public.sections s
SET academic_year_id = public.get_active_academic_year(s.school_id)
WHERE s.academic_year_id IS NULL
  AND public.get_active_academic_year(s.school_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sections d
    WHERE d.school_id = s.school_id
      AND d.class_id = s.class_id
      AND d.name = s.name
      AND d.academic_year_id = public.get_active_academic_year(s.school_id)
  );

UPDATE public.homework h
SET academic_year_id = public.get_active_academic_year(h.school_id)
WHERE h.academic_year_id IS NULL
  AND public.get_active_academic_year(h.school_id) IS NOT NULL;

UPDATE public.discipline_records d
SET academic_year_id = public.get_active_academic_year(d.school_id)
WHERE d.academic_year_id IS NULL
  AND public.get_active_academic_year(d.school_id) IS NOT NULL;

UPDATE public.attendance_records a
SET academic_year_id = public.get_active_academic_year(a.school_id)
WHERE a.academic_year_id IS NULL
  AND public.get_active_academic_year(a.school_id) IS NOT NULL;

UPDATE public.announcements an
SET academic_year_id = public.get_active_academic_year(an.school_id)
WHERE an.academic_year_id IS NULL
  AND public.get_active_academic_year(an.school_id) IS NOT NULL;

UPDATE public.school_gallery g
SET academic_year_id = public.get_active_academic_year(g.school_id)
WHERE g.academic_year_id IS NULL
  AND public.get_active_academic_year(g.school_id) IS NOT NULL;

UPDATE public.feedback f
SET academic_year_id = public.get_active_academic_year(f.school_id)
WHERE f.academic_year_id IS NULL
  AND public.get_active_academic_year(f.school_id) IS NOT NULL;

UPDATE public.fee_line_items li
SET academic_year_id = public.get_active_academic_year(li.school_id)
WHERE li.academic_year_id IS NULL
  AND public.get_active_academic_year(li.school_id) IS NOT NULL;
