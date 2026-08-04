CREATE OR REPLACE FUNCTION public.save_document_type(
  p_id uuid, p_school_id uuid, p_name text, p_description text,
  p_is_required boolean, p_expires boolean, p_default_validity_months integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.feature_enabled(p_school_id, 'kyc_documents') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.document_types
    SET name = p_name, description = NULLIF(btrim(p_description), ''),
        is_required = p_is_required, expires = p_expires, default_validity_months = p_default_validity_months
    WHERE id = p_id AND school_id = p_school_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.document_types
      (school_id, name, description, is_required, expires, default_validity_months, is_custom, sort_order)
    VALUES
      (p_school_id, p_name, NULLIF(btrim(p_description), ''), p_is_required, p_expires, p_default_validity_months, true,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.document_types WHERE school_id = p_school_id))
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.save_document_type(uuid, uuid, text, text, boolean, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_document_type_active(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.document_types WHERE id = p_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'kyc_documents') THEN RAISE EXCEPTION 'module_disabled'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Soft only — never hard-deletes a type with existing documents (edge case 3).
  UPDATE public.document_types SET is_active = p_active WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_document_type_active(uuid, boolean) TO authenticated;

-- Idempotent Indian-standard seed. Safe to call repeatedly (lazy-seed on first dashboard load).
CREATE OR REPLACE FUNCTION public.seed_document_types(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.document_types WHERE school_id = p_school_id) THEN
    RETURN; -- already seeded
  END IF;

  INSERT INTO public.document_types (school_id, name, description, is_required, expires, default_validity_months, is_custom, sort_order) VALUES
    (p_school_id, 'Birth Certificate',    NULL,                          true,  false, NULL, false, 1),
    (p_school_id, 'Transfer Certificate', 'From the previous school',    true,  false, NULL, false, 2),
    (p_school_id, 'Previous Marksheet',   'Last report card / marksheet',true,  false, NULL, false, 3),
    (p_school_id, 'Passport Photo',       'Recent colour photograph',    true,  false, NULL, false, 4),
    (p_school_id, 'Address Proof',        'Utility bill / ration card',  true,  false, NULL, false, 5),
    (p_school_id, 'Aadhaar Card',         'Optional for minors',         false, false, NULL, false, 6),
    (p_school_id, 'Medical / Vaccination','Immunisation record',         false, true,  12,   false, 7);
END; $$;
GRANT EXECUTE ON FUNCTION public.seed_document_types(uuid) TO authenticated;