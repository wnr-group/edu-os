-- Migration: 20260828000000_intervention_lifecycle_for_update.sql
--
-- Fix BLOCKER 12: Add SELECT ... FOR UPDATE to all intervention lifecycle RPCs
-- to prevent TOCTOU race conditions in concurrent state transitions.
--
-- Also fixes the revocation signature for reassign_intervention: the prior
-- revocation migration (20260824154000) incorrectly referenced the 3-param
-- overload (uuid, uuid, text) which does not exist; the actual function is
-- (uuid, uuid). This migration re-applies the correct REVOKE/GRANT.
--
-- Without FOR UPDATE, two concurrent calls (e.g., complete + dismiss) can both
-- read status='pending', pass the guard, and both write conflicting terminal
-- states. FOR UPDATE serialises row access so the losing transaction observes
-- the committed final state and raises invalid_status_transition instead.

-- ============================================================================
-- 2. start_intervention
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_intervention(
  p_intervention_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_assignee_id UUID;
  v_current_status public.intervention_status;
  v_my_role public.app_role;
  v_my_school UUID;
BEGIN
  SELECT i.school_id, i.assignee_id, i.status
  INTO v_school_id, v_assignee_id, v_current_status
  FROM public.interventions i
  WHERE i.id = p_intervention_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intervention_not_found';
  END IF;

  v_my_role := public.get_my_role();
  v_my_school := public.get_my_school_id();

  IF v_my_role = 'super_admin' THEN
    -- Authorized
  ELSIF v_my_school = v_school_id AND (
    v_my_role IN ('school_admin', 'principal')
    OR (v_my_role = 'teacher' AND v_assignee_id = auth.uid())
  ) THEN
    -- Authorized
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.interventions
  SET status = 'in_progress',
      started_at = now(),
      updated_at = now()
  WHERE id = p_intervention_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_school_id, auth.uid(), v_my_role, 'start_intervention', 'intervention', p_intervention_id,
    jsonb_build_object('from_status', v_current_status, 'to_status', 'in_progress')
  );
END;
$$;

-- ============================================================================
-- 3. complete_intervention
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_intervention(
  p_intervention_id UUID,
  p_outcome_note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_assignee_id UUID;
  v_current_status public.intervention_status;
  v_my_role public.app_role;
  v_my_school UUID;
BEGIN
  SELECT i.school_id, i.assignee_id, i.status
  INTO v_school_id, v_assignee_id, v_current_status
  FROM public.interventions i
  WHERE i.id = p_intervention_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intervention_not_found';
  END IF;

  v_my_role := public.get_my_role();
  v_my_school := public.get_my_school_id();

  IF v_my_role = 'super_admin' THEN
    -- Authorized
  ELSIF v_my_school = v_school_id AND (
    v_my_role IN ('school_admin', 'principal')
    OR (v_my_role = 'teacher' AND v_assignee_id = auth.uid())
  ) THEN
    -- Authorized
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_current_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.interventions
  SET status = 'completed',
      completed_at = now(),
      resolved_by = auth.uid(),
      outcome_note = p_outcome_note,
      updated_at = now()
  WHERE id = p_intervention_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_school_id, auth.uid(), v_my_role, 'complete_intervention', 'intervention', p_intervention_id,
    jsonb_build_object('from_status', v_current_status, 'to_status', 'completed', 'outcome_note', p_outcome_note)
  );
END;
$$;

-- ============================================================================
-- 4. dismiss_intervention
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dismiss_intervention(
  p_intervention_id UUID,
  p_dismissal_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_assignee_id UUID;
  v_current_status public.intervention_status;
  v_my_role public.app_role;
  v_my_school UUID;
BEGIN
  IF p_dismissal_reason IS NULL OR length(trim(p_dismissal_reason)) = 0 THEN
    RAISE EXCEPTION 'dismissal_reason_required';
  END IF;

  SELECT i.school_id, i.assignee_id, i.status
  INTO v_school_id, v_assignee_id, v_current_status
  FROM public.interventions i
  WHERE i.id = p_intervention_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intervention_not_found';
  END IF;

  v_my_role := public.get_my_role();
  v_my_school := public.get_my_school_id();

  IF v_my_role = 'super_admin' THEN
    -- Authorized
  ELSIF v_my_school = v_school_id AND (
    v_my_role IN ('school_admin', 'principal')
    OR (v_my_role = 'teacher' AND v_assignee_id = auth.uid())
  ) THEN
    -- Authorized
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_current_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.interventions
  SET status = 'dismissed',
      dismissed_at = now(),
      resolved_by = auth.uid(),
      dismissal_reason = p_dismissal_reason,
      updated_at = now()
  WHERE id = p_intervention_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_school_id, auth.uid(), v_my_role, 'dismiss_intervention', 'intervention', p_intervention_id,
    jsonb_build_object('from_status', v_current_status, 'to_status', 'dismissed', 'dismissal_reason', p_dismissal_reason)
  );
END;
$$;

-- ============================================================================
-- 5. reassign_intervention (2-param: uuid, uuid)
-- Also fixes the prior revocation migration which incorrectly referenced
-- the non-existent 3-param overload (uuid, uuid, text).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reassign_intervention(
  p_intervention_id UUID,
  p_new_assignee_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_old_assignee_id UUID;
  v_current_status public.intervention_status;
  v_my_role public.app_role;
  v_my_school UUID;
BEGIN
  SELECT i.school_id, i.assignee_id, i.status
  INTO v_school_id, v_old_assignee_id, v_current_status
  FROM public.interventions i
  WHERE i.id = p_intervention_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intervention_not_found';
  END IF;

  v_my_role := public.get_my_role();
  v_my_school := public.get_my_school_id();

  IF v_my_role = 'super_admin' THEN
    -- Authorized
  ELSIF v_my_school = v_school_id AND v_my_role IN ('school_admin', 'principal') THEN
    -- Authorized
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_current_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'cannot_reassign_terminal_intervention';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_new_assignee_id
      AND ur.school_id = v_school_id
      AND ur.role IN ('teacher', 'principal', 'school_admin')
      AND ur.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid_assignee';
  END IF;

  UPDATE public.interventions
  SET assignee_id = p_new_assignee_id,
      assigned_via = 'reassigned',
      updated_at = now()
  WHERE id = p_intervention_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_school_id, auth.uid(), v_my_role, 'reassign_intervention', 'intervention', p_intervention_id,
    jsonb_build_object('old_assignee_id', v_old_assignee_id, 'new_assignee_id', p_new_assignee_id)
  );
END;
$$;

-- Re-apply correct REVOKE/GRANT for reassign (fixes 20260824154000 which used wrong 3-param signature)
REVOKE ALL ON FUNCTION public.reassign_intervention(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_intervention(uuid, uuid) TO authenticated;
