-- PTM Phase 4 — availability slots (parent self-service booking).
--
-- A slot is a staff-published offer, independent of ptm_meetings until a
-- parent claims it via book_ptm_slot. Kept as its own table rather than an
-- 'available' status on ptm_meetings: student_id there is NOT NULL and every
-- Phase 1-3 read path (loadPtmRows, loadMyMeetings, loadTeacherMeetings)
-- selects explicit columns with no status filter for "not a real meeting
-- yet" — overloading ptm_meetings would either require those columns to go
-- nullable or risk an unclaimed slot leaking into the Scheduled tab as a
-- ghost meeting with no student. See the approved Phase 4 plan §02.
--
-- schedule_ptm_meeting and bulk_schedule_ptm_meetings never read or write
-- this table — direct and bulk scheduling remain fully independent of
-- parent self-service, per the plan's three-independent-paths architecture.

CREATE TYPE public.ptm_slot_status AS ENUM ('open', 'booked', 'withdrawn');

CREATE TABLE public.ptm_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  section_id uuid NOT NULL REFERENCES public.sections(id),
  subject_id uuid REFERENCES public.subjects(id),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 15 CHECK (duration_minutes > 0),
  meeting_mode public.ptm_meeting_mode NOT NULL DEFAULT 'in_person',
  location text,
  status public.ptm_slot_status NOT NULL DEFAULT 'open',
  -- Set by book_ptm_slot once claimed. The reverse pointer,
  -- ptm_meetings.booking_slot_id, is added in the next migration — together
  -- they let a query start from either side (slot -> its meeting, or
  -- meeting -> the slot it came from, which is how the Bookings tab
  -- identifies booking-origin rows).
  booked_meeting_id uuid REFERENCES public.ptm_meetings(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptm_slots_school ON public.ptm_availability_slots(school_id);
CREATE INDEX idx_ptm_slots_section ON public.ptm_availability_slots(section_id);
CREATE INDEX idx_ptm_slots_teacher_date ON public.ptm_availability_slots(teacher_id, scheduled_date);
CREATE INDEX idx_ptm_slots_status ON public.ptm_availability_slots(status);

-- SELECT-only, RPC-only writes — same shape as ptm_meetings/ptm_feedback.
ALTER TABLE public.ptm_availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptm_slots_select" ON public.ptm_availability_slots FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    public.feature_enabled(school_id, 'ptm')
    AND school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('school_admin', 'principal')
  )
  OR (public.feature_enabled(school_id, 'ptm') AND teacher_id = auth.uid())
  OR (
    -- Parent: only open slots for a section their child is actively
    -- enrolled in — same enrollment-join shape already used in
    -- apps/web/lib/ptm.ts's scheduling-context loader.
    public.feature_enabled(school_id, 'ptm')
    AND status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.student_enrollments se
      JOIN public.student_profiles sp ON sp.id = se.student_profile_id
      WHERE se.section_id = ptm_availability_slots.section_id
        AND se.academic_year_id = ptm_availability_slots.academic_year_id
        AND se.is_active = true
        AND sp.parent_profile_id = auth.uid()
    )
  )
);

-- This branch (this migration is dated after 20260821100400_core_tables_grant_fix.sql,
-- whose ALTER DEFAULT PRIVILEGES already covers new tables) still gets an
-- explicit grant, matching every table added in Phases 1-3.
GRANT SELECT ON public.ptm_availability_slots TO authenticated, service_role;
