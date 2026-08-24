-- supabase/migrations/20260824152000_interventions_rpcs.sql
--
-- Insights & Interventions V1 - Task #5, #6, #7: Interventions Domain RPCs
--
-- Creates:
-- 1. create_intervention_if_qualifying (idempotent evaluation & creation)
-- 2. start_intervention (pending -> in_progress lifecycle transition)
-- 3. complete_intervention (pending/in_progress -> completed)
-- 4. dismiss_intervention (pending/in_progress -> dismissed with mandatory reason)
-- 5. reassign_intervention (admin/principal reassignment with active staff validation)
-- 6. notify_parent_for_intervention (idempotent parent notification)

-- ============================================================================
-- 1. create_intervention_if_qualifying
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_intervention_if_qualifying(
  p_snapshot_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_student_id UUID;
  v_kind TEXT;
  v_band TEXT;
  v_score NUMERIC(5,2);
  v_recommended_action TEXT;
  v_subject_id UUID;
  v_today DATE;
  v_due_date DATE;
  v_type public.intervention_type;
  v_title TEXT;
  v_assignee UUID;
  v_assigned_via TEXT;
  v_intervention_id UUID;
  v_constraint TEXT;
BEGIN
  -- 1. Read snapshot
  SELECT s.school_id, s.student_id, s.kind, s.band, s.score, s.recommended_action, s.subject_id
  INTO v_school_id, v_student_id, v_kind, v_band, v_score, v_recommended_action, v_subject_id
  FROM public.student_risk_snapshots s
  WHERE s.id = p_snapshot_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Low band does not qualify for intervention
  IF v_band = 'LOW' THEN
    RETURN NULL;
  END IF;

  -- 2. Derive due date in Asia/Kolkata timezone
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF v_band = 'HIGH' THEN
    v_due_date := v_today;
  ELSE
    v_due_date := (v_today + 3);
  END IF;

  -- 3. Derive intervention type & title
  IF v_kind = 'attendance' THEN
    IF v_band = 'HIGH' THEN
      v_type := 'CONTACT_PARENT'::public.intervention_type;
    ELSE
      v_type := 'DISCUSS_ATTENDANCE_PATTERN'::public.intervention_type;
    END IF;
  ELSE
    IF v_band = 'HIGH' THEN
      v_type := 'ASSIGN_ACADEMIC_SUPPORT'::public.intervention_type;
    ELSE
      v_type := 'MONITOR'::public.intervention_type;
    END IF;
  END IF;

  v_title := v_recommended_action;

  -- 4. Resolve Assignee (skips inactive teachers)
  SELECT sa.class_teacher_id INTO v_assignee
  FROM public.student_enrollments se
  JOIN public.academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'active'
  JOIN public.section_assignments sa ON sa.section_id = se.section_id AND sa.academic_year_id = ay.id
  JOIN public.user_roles ur ON ur.user_id = sa.class_teacher_id
    AND ur.school_id = v_school_id AND ur.role = 'teacher' AND ur.is_active = true
  WHERE se.student_profile_id = v_student_id AND se.school_id = v_school_id AND se.is_active = true
  LIMIT 1;

  IF v_assignee IS NOT NULL THEN
    v_assigned_via := 'class_teacher';
  ELSE
    -- Fallback: any active principal or school_admin
    SELECT ur.user_id INTO v_assignee
    FROM public.user_roles ur
    WHERE ur.school_id = v_school_id AND ur.role IN ('principal', 'school_admin') AND ur.is_active = true
    ORDER BY ur.role = 'principal' DESC
    LIMIT 1;

    IF v_assignee IS NOT NULL THEN
      v_assigned_via := 'admin_fallback';
    ELSE
      RAISE EXCEPTION 'no_valid_assignee';
    END IF;
  END IF;

  -- 5. Insert intervention with constraint-specific exception handler
  BEGIN
    INSERT INTO public.interventions (
      school_id, student_id, kind, type, title, source_snapshot_id,
      status, severity_band, assignee_id, assigned_via, due_date, due_date_original
    ) VALUES (
      v_school_id, v_student_id, v_kind::public.intervention_kind, v_type, v_title, p_snapshot_id,
      'pending', v_band, v_assignee, v_assigned_via, v_due_date, v_due_date
    ) RETURNING id INTO v_intervention_id;

    -- If academic, record initial pinned evidence
    IF v_kind = 'academic' THEN
      INSERT INTO public.intervention_academic_evidence (intervention_id, snapshot_id, is_pinned)
      VALUES (v_intervention_id, p_snapshot_id, true)
      ON CONFLICT (intervention_id, snapshot_id) DO NOTHING;
    END IF;

    RETURN v_intervention_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_interventions_open_per_student_kind' THEN
      -- Existing open intervention for (student, kind)
      SELECT id INTO v_intervention_id FROM public.interventions
      WHERE student_id = v_student_id AND kind = v_kind::public.intervention_kind AND status IN ('pending', 'in_progress');

      -- Record sibling evidence for academic without repointing source_snapshot_id
      IF v_kind = 'academic' AND v_intervention_id IS NOT NULL THEN
        INSERT INTO public.intervention_academic_evidence (intervention_id, snapshot_id, is_pinned)
        VALUES (v_intervention_id, p_snapshot_id, false)
        ON CONFLICT (intervention_id, snapshot_id) DO NOTHING;
      END IF;

      RETURN v_intervention_id;
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

COMMENT ON FUNCTION public.create_intervention_if_qualifying IS
  'Evaluates a risk snapshot and idempotently creates an intervention if severity is MED or HIGH.';

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
  WHERE i.id = p_intervention_id;

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
  WHERE i.id = p_intervention_id;

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
  WHERE i.id = p_intervention_id;

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
-- 5. reassign_intervention
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
  WHERE i.id = p_intervention_id;

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

  -- Validate that new assignee is an active staff/teacher in the same school
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

-- ============================================================================
-- 6. notify_parent_for_intervention
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_parent_for_intervention(
  p_intervention_id UUID,
  p_client_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_student_id UUID;
  v_assignee_id UUID;
  v_kind public.intervention_kind;
  v_parent_id UUID;
  v_student_name TEXT;
  v_ipn_id UUID;
  v_notif_id UUID;
  v_my_role public.app_role;
  v_my_school UUID;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- 1. Authorization check
  SELECT i.school_id, i.student_id, i.assignee_id, i.kind
  INTO v_school_id, v_student_id, v_assignee_id, v_kind
  FROM public.interventions i
  WHERE i.id = p_intervention_id;

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

  -- 2. Claim idempotency slot FIRST before any side effect
  INSERT INTO public.intervention_parent_notifications (intervention_id, client_request_id, sent_by)
  VALUES (p_intervention_id, p_client_request_id, auth.uid())
  ON CONFLICT (intervention_id, client_request_id) DO NOTHING
  RETURNING id INTO v_ipn_id;

  IF v_ipn_id IS NULL THEN
    -- Already claimed: return the existing notification_id
    SELECT notification_id INTO v_notif_id
    FROM public.intervention_parent_notifications
    WHERE intervention_id = p_intervention_id AND client_request_id = p_client_request_id;
    RETURN v_notif_id;
  END IF;

  -- 3. Retrieve student's parent profile
  SELECT sp.parent_profile_id, sp.full_name
  INTO v_parent_id, v_student_name
  FROM public.student_profiles sp
  WHERE sp.id = v_student_id;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'student_has_no_parent';
  END IF;

  -- 4. Template-rendered parent-safe copy (never expose scores, bands, or internal notes)
  IF v_kind = 'attendance' THEN
    v_title := 'Attendance Notice';
    v_body := 'Your child ' || COALESCE(v_student_name, '') || ' has attendance patterns requiring attention. Please contact the school.';
  ELSE
    v_title := 'Academic Notice';
    v_body := 'Your child ' || COALESCE(v_student_name, '') || ' has academic progress areas requiring attention. Please contact the school.';
  END IF;

  INSERT INTO public.notifications (school_id, user_id, student_id, title, body, type)
  VALUES (v_school_id, v_parent_id, v_student_id, v_title, v_body, 'intervention_notice')
  RETURNING id INTO v_notif_id;

  UPDATE public.intervention_parent_notifications
  SET notification_id = v_notif_id
  WHERE id = v_ipn_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_school_id, auth.uid(), v_my_role, 'notify_parent', 'intervention', p_intervention_id,
    jsonb_build_object('client_request_id', p_client_request_id, 'notification_id', v_notif_id)
  );

  RETURN v_notif_id;
END;
$$;
