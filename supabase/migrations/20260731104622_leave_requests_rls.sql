ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- SELECT only — no INSERT/UPDATE/DELETE policies, so RLS denies all direct
-- writes by default. Every write goes through the SECURITY DEFINER RPCs above.
CREATE POLICY leave_requests_select ON public.leave_requests FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin', 'principal')
     OR public.teaches_student(student_id)
     OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = leave_requests.student_id AND sp.parent_profile_id = auth.uid()
        )
  ))
);