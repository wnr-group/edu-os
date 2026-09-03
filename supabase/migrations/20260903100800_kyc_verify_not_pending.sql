-- supabase/migrations/20260903100800_kyc_verify_not_pending.sql
--
-- PR #25 review Comment 13: verify_documents silently CONTINUEs when a
-- targeted document isn't 'submitted', instead of raising — unlike
-- reject_document, which already raises 'not_pending' in the same
-- situation. The web Notification Center's "Verify" button always calls
-- this RPC with exactly one id (notification-center.tsx's handleVerifyDoc),
-- right before calling notification-resolve to close out the card. When
-- that one document was already handled by someone else, the silent
-- CONTINUE makes the RPC report success with zero actual effect — the UI
-- shows "Document verified.", then notification-resolve correctly 403s
-- (verified_by isn't this caller), and the card never actually clears. The
-- user is told it worked while looking at proof it didn't.
--
-- Cannot edit 20260803095452_kyc_verify_rpcs.sql directly — it's already
-- on main. This is the union of that function (untouched otherwise) plus
-- the one changed guard below.
--
-- Scoped to the single-id case only: the admin KYC dashboard's bulk Verify
-- (kyc-dashboard.tsx) can legitimately multi-select several documents where
-- one has since been handled by another admin — aborting the whole batch
-- over one stale item would be worse, not better, so bulk calls keep the
-- existing silent-skip behavior. Only when p_ids has exactly one element
-- (the shape the Notification Center always uses) does a non-submitted
-- document now raise, matching reject_document's own single-document
-- behavior exactly.
CREATE OR REPLACE FUNCTION public.verify_documents(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_school_id uuid;
  v_status public.kyc_doc_status;
  v_dt_expires boolean;
  v_dt_months integer;
BEGIN
  FOREACH v_id IN ARRAY p_ids LOOP
    SELECT kd.school_id, kd.status, dt.expires, dt.default_validity_months
      INTO v_school_id, v_status, v_dt_expires, v_dt_months
    FROM public.kyc_documents kd JOIN public.document_types dt ON dt.id = kd.document_type_id
    WHERE kd.id = v_id;

    IF v_school_id IS NULL THEN CONTINUE; END IF; -- skip unknown ids silently
    IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
    IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
    IF v_status <> 'submitted' THEN
      IF array_length(p_ids, 1) = 1 THEN RAISE EXCEPTION 'not_pending'; END IF;
      CONTINUE; -- bulk call: skip this one, still process the rest of the batch
    END IF;

    UPDATE public.kyc_documents
    SET status = 'verified', verified_by = auth.uid(), verified_at = now(),
        expires_on = CASE WHEN v_dt_expires AND v_dt_months IS NOT NULL
                          THEN (current_date + (v_dt_months || ' months')::interval)::date
                          ELSE NULL END
    WHERE id = v_id;

    INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
    VALUES (v_school_id, auth.uid(), public.get_my_role(), 'kyc_verify', 'kyc_documents', v_id, '{}'::jsonb);
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.verify_documents(uuid[]) TO authenticated;
