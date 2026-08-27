-- PTM Phase 4 — per-user booking acknowledgement.
--
-- No precedent for this shape elsewhere in the codebase (checked before
-- writing the plan): a composite-key junction table, not a boolean column
-- or a single "seen_at" watermark, because the whole point is that each
-- staff member's acknowledgement is independent — one user's click must
-- never affect another's (§10 decision 2). Roster is the meeting's own
-- teacher plus same-school school_admin/principal; super_admin is
-- deliberately excluded from both the roster and the write RPC's
-- authorization (§10 decision 3) — not a day-to-day school operator.

CREATE TABLE public.ptm_booking_acknowledgements (
  meeting_id uuid NOT NULL REFERENCES public.ptm_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, user_id)
);

ALTER TABLE public.ptm_booking_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Visible to anyone who can already see the underlying meeting via the same
-- staff-facing branches as ptm_meetings_select (no parent branch here —
-- acknowledgement is staff-only bookkeeping, matching the Bookings tab's
-- own visibility in §10 decision 5).
CREATE POLICY "ptm_ack_select" ON public.ptm_booking_acknowledgements FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.ptm_meetings m
    WHERE m.id = meeting_id
      AND (
        public.get_my_role() = 'super_admin'
        OR (
          public.feature_enabled(m.school_id, 'ptm')
          AND m.school_id = public.get_my_school_id()
          AND public.get_my_role() IN ('school_admin', 'principal')
        )
        OR (public.feature_enabled(m.school_id, 'ptm') AND m.teacher_id = auth.uid())
      )
  )
);

-- No write policy — acknowledge_ptm_booking is the sole write path.
GRANT SELECT ON public.ptm_booking_acknowledgements TO authenticated, service_role;

-- ── acknowledge_ptm_booking ──────────────────────────────────────────────
-- Explicit action only (§10 decision 2) — this RPC is never called from a
-- view/mount effect anywhere in the web app, only from an "Acknowledge"
-- button's click handler. ON CONFLICT DO NOTHING makes a repeat click for
-- an already-acknowledged booking a harmless no-op rather than an error.
CREATE OR REPLACE FUNCTION public.acknowledge_ptm_booking(p_meeting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid; v_teacher_id uuid; v_booking_slot_id uuid;
BEGIN
  SELECT school_id, teacher_id, booking_slot_id INTO v_school_id, v_teacher_id, v_booking_slot_id
  FROM public.ptm_meetings WHERE id = p_meeting_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_booking_slot_id IS NULL THEN RAISE EXCEPTION 'not_a_booking'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'ptm') THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  -- Roster: same-school school_admin/principal, or the meeting's own
  -- teacher. super_admin intentionally has no branch here — §10 decision 3.
  IF NOT COALESCE(
    (public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id())
    OR (public.get_my_role() = 'teacher' AND auth.uid() = v_teacher_id),
    false
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.ptm_booking_acknowledgements (meeting_id, user_id)
  VALUES (p_meeting_id, auth.uid())
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
END $$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_ptm_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_ptm_booking(uuid) TO authenticated;
