-- Digital Student ID Card — built-in Students feature, no feature flag.
-- No new table: the card has no content of its own (name, photo, admission/
-- roll number, class/section, school branding all already live on
-- student_profiles / student_enrollments / profiles / schools, same as the
-- bonafide certificate). The only new state is a simple active/revoked
-- status plus a small audit trail.
CREATE TYPE public.id_card_status AS ENUM ('active', 'revoked');

ALTER TABLE public.student_profiles
  ADD COLUMN id_card_status public.id_card_status NOT NULL DEFAULT 'active',
  ADD COLUMN id_card_revoked_at timestamptz,
  ADD COLUMN id_card_revoked_by uuid REFERENCES auth.users(id);

-- New students automatically get an active card via the column default —
-- no trigger needed, this applies to every INSERT path (admission
-- conversion via finalize_conversion(), or a direct admin-created student).
