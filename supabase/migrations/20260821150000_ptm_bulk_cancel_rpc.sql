-- PTM — bulk cancellation.
--
-- Reuses cancel_ptm_meeting's exact authorization/eligibility rule (super_admin;
-- same-school school_admin/principal; or the meeting's own teacher) and its
-- exact status transition (scheduled -> cancelled only), applied to a batch
-- of ids in one server-side call instead of firing one RPC request per row
-- from the client. Deliberately ONE generic RPC rather than two — both UI
-- flows ("select multiple" and "cancel by class/section") resolve to a
-- meeting_id array before calling this; the section-based flow just gathers
-- ids from the already-loaded, already-RLS-scoped meeting list client-side
-- (same shape as the existing classFilter) rather than needing a second
-- section-aware RPC.
--
-- Lenient by design: rows that aren't currently 'scheduled', or that the
-- caller isn't authorized to cancel, are silently skipped rather than
-- failing the whole batch — "only cancel eligible ones" is the actual
-- requirement, not "all-or-nothing". Returns the ids that were actually
-- cancelled so the caller can report an accurate count (and detect if some
-- were skipped, e.g. already completed by the time this ran).
--
-- Booking-origin meetings (booking_slot_id IS NOT NULL) are not special-cased
-- here — a parent-booked meeting that is currently 'scheduled' is exactly as
-- eligible as any other scheduled meeting the caller may cancel. This RPC
-- never touches ptm_availability_slots, matching cancel_ptm_meeting's own
-- behavior — a cancelled booking's originating slot stays 'booked' (not
-- reopened), same as it would if the single-cancel RPC had been used.
--
-- The clash trigger (trg_check_ptm_meeting_clash) still fires on this
-- UPDATE (its column list includes `status`), but it returns immediately
-- for any NEW.status <> 'scheduled', so cancelling never trips it.
CREATE OR REPLACE FUNCTION public.bulk_cancel_ptm_meetings(
  p_meeting_ids uuid[],
  p_reason text DEFAULT NULL
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cancelled_ids uuid[] := '{}';
  r record;
BEGIN
  IF p_meeting_ids IS NULL OR array_length(p_meeting_ids, 1) IS NULL THEN
    RETURN v_cancelled_ids;
  END IF;

  FOR r IN
    SELECT m.id
    FROM public.ptm_meetings m
    WHERE m.id = ANY(p_meeting_ids)
      AND m.status = 'scheduled'
      AND public.feature_enabled(m.school_id, 'ptm')
      AND COALESCE(
        public.get_my_role() = 'super_admin'
        OR (public.get_my_role() IN ('school_admin', 'principal') AND m.school_id = public.get_my_school_id())
        OR auth.uid() = m.teacher_id,
        false
      )
  LOOP
    UPDATE public.ptm_meetings
    SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_reason = p_reason
    WHERE id = r.id;
    v_cancelled_ids := array_append(v_cancelled_ids, r.id);
  END LOOP;

  IF array_length(v_cancelled_ids, 1) > 0 THEN
    -- One summary row per school touched (normally just one) — same
    -- one-row-per-bulk-call shape as bulk_schedule_ptm_meetings's audit
    -- entry, rather than one row per cancelled meeting.
    INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
    SELECT m.school_id, auth.uid(), public.get_my_role(), 'ptm.bulk_cancel', 'ptm_meetings', NULL,
           jsonb_build_object('meeting_ids', array_agg(m.id), 'count', count(*), 'reason', p_reason)
    FROM public.ptm_meetings m
    WHERE m.id = ANY(v_cancelled_ids)
    GROUP BY m.school_id;
  END IF;

  RETURN v_cancelled_ids;
END $$;

GRANT EXECUTE ON FUNCTION public.bulk_cancel_ptm_meetings(uuid[], text) TO authenticated;
