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
    IF v_status <> 'submitted' THEN CONTINUE; END IF; -- state guard: only from submitted (edge case 2)

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

CREATE OR REPLACE FUNCTION public.reject_document(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school_id uuid;
  v_status public.kyc_doc_status;
BEGIN
  SELECT school_id, status INTO v_school_id, v_status FROM public.kyc_documents WHERE id = p_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status <> 'submitted' THEN RAISE EXCEPTION 'not_pending'; END IF;

  UPDATE public.kyc_documents
  SET status = 'rejected', rejection_reason = NULLIF(btrim(p_reason), ''), verified_by = auth.uid(), verified_at = now()
  WHERE id = p_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'kyc_reject', 'kyc_documents', p_id, jsonb_build_object('reason', p_reason));
END; $$;
GRANT EXECUTE ON FUNCTION public.reject_document(uuid, text) TO authenticated;