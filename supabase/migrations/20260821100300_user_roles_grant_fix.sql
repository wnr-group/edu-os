-- Fix: authenticated had no table-level SELECT on user_roles on this branch
-- (only TRUNCATE/REFERENCES/TRIGGER — this branch has no ALTER DEFAULT
-- PRIVILEGES bootstrap). The RLS policy (user_roles_select: user_id =
-- auth.uid() OR ...) was already correct, but RLS and table grants are
-- separate layers — without this grant, any direct client read of
-- user_roles as `authenticated` gets a 403 regardless of RLS. This is what
-- was breaking mobile login's role/access check in active-context.tsx,
-- which queries user_roles directly (unlike the web app, which resolves
-- roles through a service-role client in proxy.ts and never hit this gap).
GRANT SELECT ON public.user_roles TO authenticated;
