-- Lets document types be classified without name-matching, so the Health
-- tab can reliably show only medical documents (Birth Certificate etc. stay
-- out of it) and future categories can be added the same way.
ALTER TABLE public.document_types ADD COLUMN category text NOT NULL DEFAULT 'general';
ALTER TABLE public.document_types ADD CONSTRAINT document_types_category_check CHECK (category IN ('general', 'medical'));

-- Exact-name match only catches the untouched seeded default — a school
-- that renamed this type ("Immunisation Record", "Vaccination Card", ...)
-- or added its own medical document type (the settings page lets schools
-- add custom types freely) would stay 'general' forever, and the Health
-- tab's `.filter(r => r.category === "medical")` would silently show
-- nothing for them. Widened to a name pattern instead of one exact string.
-- Guarded by `category = 'general'` so this is idempotent and never
-- reclassifies a row someone (or a future settings-page toggle) already
-- set explicitly, in either direction.
UPDATE public.document_types
SET category = 'medical'
WHERE category = 'general'
  AND (
    name ILIKE '%vaccin%' OR name ILIKE '%immunis%' OR name ILIKE '%immuniz%'
    OR name ILIKE '%medical%' OR name ILIKE '%health%'
  );

CREATE OR REPLACE FUNCTION public.seed_document_types(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.document_types WHERE school_id = p_school_id) THEN
    RETURN; -- already seeded
  END IF;

  INSERT INTO public.document_types (school_id, name, description, is_required, expires, default_validity_months, is_custom, sort_order, category) VALUES
    (p_school_id, 'Birth Certificate',    NULL,                          true,  false, NULL, false, 1, 'general'),
    (p_school_id, 'Transfer Certificate', 'From the previous school',    true,  false, NULL, false, 2, 'general'),
    (p_school_id, 'Previous Marksheet',   'Last report card / marksheet',true,  false, NULL, false, 3, 'general'),
    (p_school_id, 'Passport Photo',       'Recent colour photograph',    true,  false, NULL, false, 4, 'general'),
    (p_school_id, 'Address Proof',        'Utility bill / ration card',  true,  false, NULL, false, 5, 'general'),
    (p_school_id, 'Aadhaar Card',         'Optional for minors',         false, false, NULL, false, 6, 'general'),
    (p_school_id, 'Medical / Vaccination','Immunisation record',         false, true,  12,   false, 7, 'medical');
END; $$;
GRANT EXECUTE ON FUNCTION public.seed_document_types(uuid) TO authenticated;
