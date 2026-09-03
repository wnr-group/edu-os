-- Two additions to public.feedback, both needed for multi-recipient
-- resolution (a School Admin acting must be visible to Principal, and vice
-- versa, without a second response workflow):
--   responded_by: mirrors leave_requests.decided_by / kyc_documents.verified_by
--     — who actually responded, so the resolution message can say
--     "Responded by School Admin" without trusting a client-supplied label.
--   thread_id: links the two rows Contact Management inserts (one
--     to_role='school_admin', one to_role='principal') for the same parent
--     submission, so responding to either resolves both. NULL for every
--     other feedback flow (Message Teacher inserts exactly one row, no
--     sibling to link). Not a foreign key — it's a grouping key, not a
--     reference to one canonical row.
ALTER TABLE public.feedback
  ADD COLUMN responded_by uuid REFERENCES auth.users(id),
  ADD COLUMN thread_id uuid;

CREATE INDEX idx_feedback_thread_id ON public.feedback (thread_id) WHERE thread_id IS NOT NULL;
