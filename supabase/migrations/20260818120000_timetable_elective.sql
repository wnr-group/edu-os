-- Timetable elective flag — a simple Regular/Elective option per timetable
-- entry. Approved scope only: no student-level elective selection, no
-- elective groups, no change to the existing section/day/period uniqueness
-- (idx_timetable_section_year_day_period is untouched).
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS is_elective boolean NOT NULL DEFAULT false;
