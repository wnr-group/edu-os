-- Gated on 'report_cards' per registry mapping (edge case #17) — not 'exams'.
DROP POLICY IF EXISTS "report_card_templates_select" ON public.report_card_templates;
CREATE POLICY "report_card_templates_select" ON public.report_card_templates FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'report_cards') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "report_card_templates_write" ON public.report_card_templates;
CREATE POLICY "report_card_templates_write" ON public.report_card_templates FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'report_cards') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'report_cards') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );