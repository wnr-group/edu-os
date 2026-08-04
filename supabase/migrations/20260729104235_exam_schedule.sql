-- Exam datesheet (ERP-69): rooms, exam_schedule_slots, exams columns, named
-- clash trigger, staff RLS. Parent RLS is added separately in ERP-70, once
-- publish/notify semantics are wired — kept as its own migration so this one
-- can land and be tested independently.

ALTER TABLE public.exams
  ADD COLUMN datesheet_published_at timestamptz,
  ADD COLUMN datesheet_last_notified_at timestamptz;

-- ── rooms — minimal, add-on-the-fly, capacity captured but not enforced ─────
CREATE TABLE public.rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  capacity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
CREATE INDEX idx_rooms_school_id ON public.rooms(school_id);
CREATE UNIQUE INDEX idx_rooms_school_id_lower_name ON public.rooms (school_id, lower(name));

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Staff-only — parents never see rooms in any planned UI (room is omitted
-- from the parent datesheet entirely, per D15's roll_number-nullable rationale).
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal', 'teacher') AND school_id = public.get_my_school_id())
  );

CREATE POLICY "rooms_write" ON public.rooms FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  );

-- ── exam_schedule_slots — class+subject granularity, one paper per exam ────
CREATE TABLE public.exam_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  subject_id uuid not null references public.subjects(id),
  exam_date date not null,
  start_time time not null,
  end_time time not null,
  room_id uuid references public.rooms(id),
  invigilator_id uuid references auth.users(id),
  is_dirty boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (exam_id, class_id, subject_id)
);
CREATE INDEX idx_exam_schedule_slots_school_id ON public.exam_schedule_slots(school_id);
CREATE INDEX idx_exam_schedule_slots_exam_id ON public.exam_schedule_slots(exam_id);
CREATE INDEX idx_exam_schedule_slots_exam_date ON public.exam_schedule_slots(exam_date);

-- Keeps updated_at fresh (drives the parent "updated" badge, ERP-70) and marks
-- a slot dirty when it changes AFTER the datesheet was already published —
-- editing a not-yet-published slot doesn't need a "Publish changes" ping.
CREATE OR REPLACE FUNCTION public.touch_exam_schedule_slot()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_published boolean;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    SELECT datesheet_published_at IS NOT NULL INTO v_published
    FROM public.exams WHERE id = NEW.exam_id;
    IF v_published AND (
      NEW.exam_date IS DISTINCT FROM OLD.exam_date OR
      NEW.start_time IS DISTINCT FROM OLD.start_time OR
      NEW.end_time IS DISTINCT FROM OLD.end_time OR
      NEW.room_id IS DISTINCT FROM OLD.room_id OR
      NEW.invigilator_id IS DISTINCT FROM OLD.invigilator_id OR
      NEW.subject_id IS DISTINCT FROM OLD.subject_id
    ) THEN
      NEW.is_dirty := true;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_exam_schedule_slot ON public.exam_schedule_slots;
CREATE TRIGGER trg_touch_exam_schedule_slot BEFORE INSERT OR UPDATE ON public.exam_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_exam_schedule_slot();

-- Named clash detection — a trigger, not an EXCLUDE constraint, specifically
-- so the error can name what it collided with (mirrors the mockup's "Room A
-- is booked for Class 8 · Mathematics, 09:30–11:30" copy). Checked across
-- exams, not just within one — a room can't host two different exams' papers
-- at the same clock time either.
CREATE OR REPLACE FUNCTION public.check_exam_slot_clash()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_room_name text;
  v_invigilator_name text;
  v_class_name text;
  v_other record;
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    SELECT s.start_time, s.end_time, c.name AS class_name, sub.name AS subject_name
      INTO v_other
      FROM public.exam_schedule_slots s
      JOIN public.classes c ON c.id = s.class_id
      JOIN public.subjects sub ON sub.id = s.subject_id
      WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND s.school_id = NEW.school_id
        AND s.exam_date = NEW.exam_date
        AND s.room_id = NEW.room_id
        AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      LIMIT 1;
    IF FOUND THEN
      SELECT name INTO v_room_name FROM public.rooms WHERE id = NEW.room_id;
      RAISE EXCEPTION 'Room "%" is booked for % · %, %–%',
        v_room_name, v_other.class_name, v_other.subject_name,
        to_char(v_other.start_time, 'HH24:MI'), to_char(v_other.end_time, 'HH24:MI');
    END IF;
  END IF;

  IF NEW.invigilator_id IS NOT NULL THEN
    SELECT s.start_time, s.end_time, c.name AS class_name, sub.name AS subject_name
      INTO v_other
      FROM public.exam_schedule_slots s
      JOIN public.classes c ON c.id = s.class_id
      JOIN public.subjects sub ON sub.id = s.subject_id
      WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND s.school_id = NEW.school_id
        AND s.exam_date = NEW.exam_date
        AND s.invigilator_id = NEW.invigilator_id
        AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      LIMIT 1;
    IF FOUND THEN
      SELECT COALESCE(p.full_name, 'This invigilator') INTO v_invigilator_name
        FROM public.profiles p WHERE p.id = NEW.invigilator_id;
      RAISE EXCEPTION '% is invigilating % · %, %–%',
        v_invigilator_name, v_other.class_name, v_other.subject_name,
        to_char(v_other.start_time, 'HH24:MI'), to_char(v_other.end_time, 'HH24:MI');
    END IF;
  END IF;

  -- Class clash: same class, two papers overlapping — any subject, any exam.
  SELECT s.start_time, s.end_time, sub.name AS subject_name
    INTO v_other
    FROM public.exam_schedule_slots s
    JOIN public.subjects sub ON sub.id = s.subject_id
    WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.school_id = NEW.school_id
      AND s.exam_date = NEW.exam_date
      AND s.class_id = NEW.class_id
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
    LIMIT 1;
  IF FOUND THEN
    SELECT name INTO v_class_name FROM public.classes WHERE id = NEW.class_id;
    RAISE EXCEPTION 'Class % already sits % at %–%',
      v_class_name, v_other.subject_name,
      to_char(v_other.start_time, 'HH24:MI'), to_char(v_other.end_time, 'HH24:MI');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_check_exam_slot_clash ON public.exam_schedule_slots;
CREATE TRIGGER trg_check_exam_slot_clash BEFORE INSERT OR UPDATE ON public.exam_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION public.check_exam_slot_clash();

ALTER TABLE public.exam_schedule_slots ENABLE ROW LEVEL SECURITY;

-- Staff-only — deliberately excludes parent/student so ERP-70's separate
-- published-only parent policy is the ONLY way a parent ever sees a row here.
CREATE POLICY "exam_schedule_slots_select_staff" ON public.exam_schedule_slots FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal', 'teacher') AND school_id = public.get_my_school_id())
  );

CREATE POLICY "exam_schedule_slots_write" ON public.exam_schedule_slots FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  );