-- Fix: notifications_select let ANY school_admin read every notification in
-- the entire database, across every school (the role check had no school_id
-- condition at all). Tightened to same-school, and principal added — the web
-- notification center is staff-facing (admin AND principal), and principal
-- was simply missing from the original policy.
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
  );
