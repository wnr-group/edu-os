-- supabase/migrations/20260903101100_notifications_insert_owner_scope.sql
--
-- PR #25 review (Comment #20's "issue #30", verified independently):
-- notifications_insert (20240001000010_rls.sql, already on main) only
-- checks `school_id = get_my_school_id()` — there is no constraint on
-- user_id at all. Any authenticated user can INSERT a notifications row
-- for ANY user_id, with arbitrary title/body/type text, as long as the
-- school_id matches a school they belong to.
--
-- Verified every legitimate producer (feedback-notify, kyc-document-notify,
-- leave-notify, send-fee-reminder, and every other *-notify Edge Function,
-- plus the admissions convert route) writes through a service-role client,
-- which bypasses RLS entirely — none of them rely on this policy to permit
-- inserting for another user. So the only thing this policy currently
-- permits, that no real flow needs, is a plain authenticated client
-- inserting a notification for someone other than themselves.
--
-- Cannot edit 20240001000010 directly — it's already on main.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      user_id = auth.uid()
      AND school_id = public.get_my_school_id()
    )
  );
