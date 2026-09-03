-- Needed for the notification detail view's "Date/time" of a response —
-- feedback.created_at is the submission time, not the response time, and
-- no other column captures when a reply was sent. Mirrors
-- leave_requests.decided_at / kyc_documents.verified_at, which already
-- exist for exactly this purpose on their own tables.
ALTER TABLE public.feedback
  ADD COLUMN responded_at timestamptz;
