-- Web notification center — lets an actionable notification ("Approve this
-- leave request", "Verify this document") point at the specific row it's
-- about, instead of only the free-text title/body. Nullable: purely
-- informational notifications (birthday wishes, exam reminders, ...) never
-- set these and keep working unchanged.
ALTER TABLE public.notifications
  ADD COLUMN entity_type text,
  ADD COLUMN entity_id uuid;

CREATE INDEX idx_notifications_entity ON public.notifications (entity_type, entity_id);
