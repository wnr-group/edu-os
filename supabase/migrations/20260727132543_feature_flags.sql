-- F1 — Module Toggle foundation: feature_enabled() gate, guard trigger, and
-- seed/backfill for schools.features_enabled (added in migration 000001,
-- used nowhere until now).
--
-- Ordering matters: seed BEFORE any RLS retrofit adds feature_enabled()
-- checks to existing tables (ERP-62) — absent key = OFF (fail-safe), so an
-- un-seeded school would go dark on modules it already has.

-- ── 1. feature_enabled() — the authoritative gate ───────────────────────────
CREATE OR REPLACE FUNCTION public.feature_enabled(p_school_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((s.features_enabled ->> p_key)::boolean, false)
  FROM public.schools s WHERE s.id = p_school_id;
$$;

GRANT EXECUTE ON FUNCTION public.feature_enabled(uuid, text) TO authenticated, service_role;

-- ── 2. guard_features_enabled — locks toggle writes to super_admin ──────────
-- RLS is row-level, not column-level: "schools_update" (fix_schools_update_rls.sql)
-- already lets school_admin update their own school row for the settings page,
-- which today means a school_admin could also flip their own features_enabled.
-- This trigger closes that gap at the column level, independent of RLS.
--
-- The platform-admin console writes through api/schools/[id]/route.ts, which
-- already checks super_admin in application code but uses the service-role
-- client — service-role connections don't run scope_pre_request(), so
-- get_my_role() reads NULL for them. Allow current_user = 'service_role'
-- alongside the super_admin check so the console's own write path isn't
-- locked out by the trigger meant to guard against OTHER actors.
CREATE OR REPLACE FUNCTION public.guard_features_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.features_enabled IS DISTINCT FROM OLD.features_enabled
     AND public.get_my_role() <> 'super_admin'
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Only platform admins can change module toggles';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_features ON public.schools;
CREATE TRIGGER trg_guard_features BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.guard_features_enabled();

-- ── 3. Backfill existing schools ─────────────────────────────────────────────
-- Merge (not overwrite) — safe to re-run. Existing modules default ON;
-- not-yet-built modules default OFF, per packages/shared/src/features/registry.ts.
UPDATE public.schools SET features_enabled = features_enabled || jsonb_build_object(
  'attendance', true, 'homework', true, 'exams', true, 'report_cards', true,
  'syllabus', true, 'timetable', true,
  'fees', true, 'announcements', true, 'gallery', true, 'feedback', true, 'discipline', true,
  'attendance_geo', false, 'exam_schedule', false, 'admissions', false, 'kyc_documents', false,
  'leave', false, 'testing', false, 'online_payments', false, 'insights', false
);

-- ── 4. Seed new schools on insert ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_features_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.features_enabled IS NULL OR NEW.features_enabled = '{}'::jsonb THEN
    NEW.features_enabled := jsonb_build_object(
      'attendance', true, 'homework', true, 'exams', true, 'report_cards', true,
      'syllabus', true, 'timetable', true,
      'fees', true, 'announcements', true, 'gallery', true, 'feedback', true, 'discipline', true,
      'attendance_geo', false, 'exam_schedule', false, 'admissions', false, 'kyc_documents', false,
      'leave', false, 'testing', false, 'online_payments', false, 'insights', false
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_features ON public.schools;
CREATE TRIGGER trg_seed_features BEFORE INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.seed_features_enabled();