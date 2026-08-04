-- <ts>_school_domains.sql

CREATE TABLE public.school_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  label text,                    -- optional, e.g. 'vercel-demo' — for your own reference only
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX school_domains_school_id_idx ON public.school_domains(school_id);

ALTER TABLE public.school_domains ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — this is only ever read through the
-- SECURITY DEFINER function below, or by service-role clients directly.
REVOKE ALL ON public.school_domains FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.school_domains TO service_role;

-- Single resolution point used by proxy.ts, lib/school.ts, and the login
-- page — checks the canonical schools.domain first, then any alias.
-- Returns NULL if no match OR the matched school is inactive, so callers
-- can treat "no row" as the single not-found signal (same semantics as
-- the current `!school || !school.is_active` check in proxy.ts).
CREATE OR REPLACE FUNCTION public.get_school_id_by_domain(p_domain text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id FROM public.schools s
  WHERE s.domain = p_domain AND s.is_active = true
  UNION
  SELECT sd.school_id FROM public.school_domains sd
  JOIN public.schools s ON s.id = sd.school_id
  WHERE sd.domain = p_domain AND s.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_school_id_by_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_id_by_domain(text) TO service_role;