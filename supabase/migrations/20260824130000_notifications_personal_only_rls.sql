-- Supersedes 20260824120000's school-scoped staff-visibility clause. That
-- fix only narrowed the leak from "every school" to "same school", but
-- same-school admin/principal could still SELECT a notification actually
-- addressed to someone else (e.g. a leave-requested row whose user_id is
-- the class teacher) — which let them see and act on an Approve/Reject
-- card that was never meant for them, and let their attempted mark-as-read
-- UPDATE silently no-op under notifications_update's own user_id=auth.uid()
-- check (optimistic UI showed it as read; a refresh reverted it, since
-- nothing was actually persisted). Notifications are strictly personal —
-- no role gets to see anyone else's inbox, including super_admin, who
-- currently has no legitimate reason to (no producer targets super_admin
-- today, and none of the "staff sees everything" cases in the reviewed
-- workflows depend on it).
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      type = 'fee_reminder'
      AND school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('school_admin', 'principal')
    )
  );
