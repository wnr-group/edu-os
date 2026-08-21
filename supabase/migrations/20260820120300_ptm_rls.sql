-- PTM Phase 1 — RLS.
--
-- SELECT-only policies, no INSERT/UPDATE/DELETE policies on either table —
-- every write goes through a SECURITY DEFINER RPC in ptm_rpcs.sql. This is
-- the same shape as leave_requests: table-level write RLS is intentionally
-- absent because the RPCs are the sole write path and do their own
-- authorization.

ALTER TABLE public.ptm_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptm_meetings_select" ON public.ptm_meetings FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    public.feature_enabled(school_id, 'ptm')
    AND school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('school_admin', 'principal')
  )
  OR (public.feature_enabled(school_id, 'ptm') AND teacher_id = auth.uid())
  OR (public.feature_enabled(school_id, 'ptm') AND public.is_parent_of_student(student_id))
);

ALTER TABLE public.ptm_feedback ENABLE ROW LEVEL SECURITY;

-- Staff-only for Phase 1. internal_notes can't be hidden column-by-column
-- via RLS (RLS is row-level), so parent access is deferred to Phase 2,
-- shipped together with a get_ptm_feedback_for_parent() RPC that selects an
-- explicit column list omitting internal_notes — same technique already
-- used for quiz_options.is_correct in the Testing module.
CREATE POLICY "ptm_feedback_select" ON public.ptm_feedback FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (
    public.feature_enabled(school_id, 'ptm')
    AND school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('school_admin', 'principal')
  )
  OR (public.feature_enabled(school_id, 'ptm') AND teacher_id = auth.uid())
);
