-- =============================================================
-- Platform admin bootstrap — NEW project (jphectudpmuwdbroxumq)
-- Creates ONLY the super_admin. No demo school / students / seed data.
-- Run once against the new project after `supabase db push`.
--
-- Login: phone 919000000001, OTP delivered via the Send SMS hook
-- (HTTPS -> send-sms Edge Function -> Nettyfish).
-- =============================================================

-- Super admin auth user. handle_new_user() trigger auto-creates the
-- matching public.profiles row.
INSERT INTO auth.users (
  id, phone, phone_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000010', '919000000001', now(),
  '{"full_name":"Dinesh (Super Admin)"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000', '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- Ensure profile phone is populated (older trigger versions don't copy it).
UPDATE public.profiles
  SET phone = '+919000000001'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000010';

-- Platform-wide super_admin role (school_id NULL = not scoped to a school).
INSERT INTO public.user_roles (user_id, school_id, role, is_active)
VALUES ('aaaaaaaa-0000-0000-0000-000000000010', NULL, 'super_admin', true)
ON CONFLICT DO NOTHING;
