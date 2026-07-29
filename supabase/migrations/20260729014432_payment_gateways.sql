-- Per-school Razorpay credentials (ERP-63). Replaces the global RAZORPAY_KEY_ID/
-- SECRET env vars. No secrets in this table — key_id is Razorpay's public key,
-- safe to store/read like any other column. Secrets live in Vault, namespaced
-- per school, accessed only via the SECURITY DEFINER functions below.
--
-- Deliberately NOT gated by feature_enabled() — per the ticket, this is
-- payments infrastructure, standalone from the module-toggle system. A school
-- can have gateway credentials configured while online_payments is off (e.g.
-- mid-setup, before flipping the flag on).

CREATE TABLE public.school_payment_gateways (
  school_id     UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider = 'razorpay'),
  key_id        TEXT,
  -- Derived, read-only from the key prefix — matches the acceptance criteria
  -- ("mode is derived read-only from key prefix"), enforced at the DB level
  -- rather than trusted from the client.
  mode          TEXT GENERATED ALWAYS AS (
    CASE
      WHEN key_id LIKE 'rzp\_live\_%' ESCAPE '\' THEN 'live'
      WHEN key_id LIKE 'rzp\_test\_%' ESCAPE '\' THEN 'test'
      ELSE NULL
    END
  ) STORED,
  status        TEXT NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('unconfigured', 'configured')),
  account_name  TEXT,
  updated_by    UUID REFERENCES public.profiles(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_payment_gateways_select" ON public.school_payment_gateways FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );

CREATE POLICY "school_payment_gateways_write" ON public.school_payment_gateways FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );

-- ── Vault accessors ──────────────────────────────────────────────────────────
-- Naming convention shared by read and write paths, kept in one place.
CREATE OR REPLACE FUNCTION public._payment_secret_name(p_school_id uuid, p_kind text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE p_kind
    WHEN 'key_secret' THEN 'razorpay_key_secret::' || p_school_id::text
    WHEN 'webhook_secret' THEN 'razorpay_webhook_secret::' || p_school_id::text
    ELSE NULL
  END;
$$;

-- Read. Mirrors public._vault_get()'s shape (migration 054) but namespaced
-- per school. service_role only — this is what the edge functions call.
CREATE OR REPLACE FUNCTION public.get_payment_secret(p_school_id uuid, p_kind text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = public._payment_secret_name(p_school_id, p_kind)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_payment_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_secret(uuid, text) TO service_role;

-- Write (upsert). Used by the console's "Save gateway" action (Phase 3) —
-- included now so the DB layer is complete and self-contained, even though
-- nothing calls it yet. service_role only; never exposed to authenticated
-- directly — the web route that calls this must itself enforce super_admin.
--
-- NOTE: relies on vault.create_secret(secret, name)/vault.update_secret(id, secret)
-- — the standard Supabase Vault extension API. Worth a quick sanity check
-- against your installed extension version before Phase 3 wires this up; I
-- can't execute this migration to confirm the signature myself.
CREATE OR REPLACE FUNCTION public.set_payment_secret(p_school_id uuid, p_kind text, p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_name text := public._payment_secret_name(p_school_id, p_kind);
  v_existing_id uuid;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'invalid_secret_kind';
  END IF;

  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = v_name;
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_value);
  ELSE
    PERFORM vault.create_secret(p_value, v_name);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_payment_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_payment_secret(uuid, text, text) TO service_role;