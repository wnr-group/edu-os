-- Parent-Teacher Meeting (PTM) Management — Phase 1.
-- See docs plan: staff-initiated scheduling (admin/principal/teacher), one
-- meeting row per student, no cancellation window, section/teacher context
-- pinned at creation (not re-derived), in-person/online mode without any
-- conferencing-provider integration yet.

CREATE TYPE public.ptm_meeting_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- 'online' only records that the meeting is remote; no conferencing
-- provider integration in Phase 1 — `location` on ptm_meetings holds either
-- a room name (in_person) or a manually-entered link/instructions (online).
-- A later phase can add conferencing_provider/conferencing_url columns
-- without touching this enum.
CREATE TYPE public.ptm_meeting_mode AS ENUM ('in_person', 'online');
