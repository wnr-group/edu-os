ALTER TABLE public.admission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY admission_settings_select ON public.admission_settings FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND public.get_my_role() IN ('school_admin', 'principal')
      AND public.feature_enabled(school_id, 'admissions'))
);

CREATE POLICY admission_applications_select ON public.admission_applications FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND public.get_my_role() IN ('school_admin', 'principal')
      AND public.feature_enabled(school_id, 'admissions'))
);

CREATE POLICY admission_stage_events_select ON public.admission_stage_events FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND public.get_my_role() IN ('school_admin', 'principal')
      AND public.feature_enabled(school_id, 'admissions'))
);
-- No write policies anywhere — all writes via the RPCs / service-role.