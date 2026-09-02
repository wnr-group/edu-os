-- PTM Phase 4 — the one Phase 1-3 schema touch approved in the plan (§10
-- decision 4): a nullable pointer from a meeting back to the slot it was
-- booked from. NULL for every direct- or bulk-scheduled meeting; set only
-- by book_ptm_slot. Additive and nullable, and every existing read of
-- ptm_meetings (loadPtmRows, loadMyMeetings, loadTeacherMeetings) already
-- selects an explicit column list rather than "*", so Phase 1-3 code is
-- structurally unaffected by this column's existence.
--
-- This is also the signal the duplicate-booking rule in book_ptm_slot uses
-- to tell a parent-booked meeting apart from a staff-scheduled one, and the
-- signal the Bookings tab uses to find booking-origin rows.
ALTER TABLE public.ptm_meetings
  ADD COLUMN booking_slot_id uuid REFERENCES public.ptm_availability_slots(id);

CREATE INDEX idx_ptm_meetings_booking_slot ON public.ptm_meetings(booking_slot_id)
  WHERE booking_slot_id IS NOT NULL;
