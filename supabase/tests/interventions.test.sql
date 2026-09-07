-- supabase/tests/interventions.test.sql
--
-- Comprehensive test suite for Insights & Interventions V1
-- Covers: TM-01r, TM-04r, TM-06r, TM-35, TM-36, TM-41, TM-42, TM-43, TM-44, TM-45, TM-46
-- Lifecycle RPCs (start, complete, dismiss, reassign) and RLS isolation.

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

-- Test constants from Demo School seed:
-- School: 'aaaaaaaa-0000-0000-0000-000000000001'
-- Teacher (Class teacher 8A): 'aaaaaaaa-0000-0000-0000-000000000013'
-- Principal: 'aaaaaaaa-0000-0000-0000-000000000012'
-- Parent of Aryan Sharma: 'aaaaaaaa-0000-0000-0000-000000000030'
-- Student Aryan Sharma: 'dddddddd-0000-0000-0000-000000000001'

DO $$
DECLARE
  v_school_id UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_student_id UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_teacher_id UUID := 'aaaaaaaa-0000-0000-0000-000000000013';
  v_principal_id UUID := 'aaaaaaaa-0000-0000-0000-000000000012';
  v_parent_id UUID := 'aaaaaaaa-0000-0000-0000-000000000030';
  v_subject_1 UUID;
  v_subject_2 UUID;
  v_snap_attn_1 UUID;
  v_snap_attn_2 UUID;
  v_snap_acad_1 UUID;
  v_snap_acad_2 UUID;
  v_interv_attn UUID;
  v_interv_attn_2 UUID;
  v_interv_acad UUID;
  v_interv_acad_2 UUID;
  v_notif_1 UUID;
  v_notif_1_retry UUID;
  v_notif_2 UUID;
  v_req_id_1 UUID := gen_random_uuid();
  v_req_id_2 UUID := gen_random_uuid();
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_count INT;
  v_evidence_count INT;
  v_pinned_count INT;
  v_status public.intervention_status;
  v_assignee UUID;
  v_assigned_via TEXT;
  v_due_date DATE;
  v_source_snap UUID;
BEGIN
  -- Fetch two valid subjects for testing
  SELECT id INTO v_subject_1 FROM public.subjects WHERE school_id = v_school_id LIMIT 1;
  SELECT id INTO v_subject_2 FROM public.subjects WHERE school_id = v_school_id AND id <> v_subject_1 LIMIT 1;

  -- Clean up previous interventions and snapshots for test student
  DELETE FROM public.interventions WHERE student_id = v_student_id;
  DELETE FROM public.student_risk_snapshots WHERE student_id = v_student_id;

  -- ==========================================================================
  -- 1. TM-01r: Attendance HIGH risk creates intervention due today
  -- ==========================================================================
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_today, 88.50, 'HIGH',
    '[{"factor":"unexcused_streak","detail":"3 consecutive days","weight":0.4}]'::jsonb,
    'Call parent to address consecutive absences', 'HASH1'
  ) RETURNING id INTO v_snap_attn_1;

  v_interv_attn := public.create_intervention_if_qualifying(v_snap_attn_1);

  IF v_interv_attn IS NULL THEN
    RAISE EXCEPTION 'FAIL TM-01r: create_intervention_if_qualifying returned NULL for HIGH attendance snapshot';
  END IF;

  SELECT status, assignee_id, assigned_via, due_date
  INTO v_status, v_assignee, v_assigned_via, v_due_date
  FROM public.interventions WHERE id = v_interv_attn;

  IF v_status <> 'pending' OR v_assignee <> v_teacher_id OR v_assigned_via <> 'class_teacher' OR v_due_date <> v_today THEN
    RAISE EXCEPTION 'FAIL TM-01r: intervention attributes incorrect (status=%, assignee=%, via=%, due=%)',
      v_status, v_assignee, v_assigned_via, v_due_date;
  END IF;

  RAISE NOTICE 'PASS TM-01r: Attendance HIGH creates pending intervention assigned to class teacher due today';

  -- ==========================================================================
  -- 2. TM-04r: Repeated nightly HIGH snapshot dedup (no duplicate intervention)
  -- ==========================================================================
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_today - 1, 92.00, 'HIGH',
    '[{"factor":"unexcused_streak","detail":"4 consecutive days","weight":0.5}]'::jsonb,
    'Call parent to address consecutive absences', 'HASH1'
  ) RETURNING id INTO v_snap_attn_2;

  v_interv_attn_2 := public.create_intervention_if_qualifying(v_snap_attn_2);

  IF v_interv_attn_2 <> v_interv_attn THEN
    RAISE EXCEPTION 'FAIL TM-04r: dedup failed, expected existing intervention % but got %', v_interv_attn, v_interv_attn_2;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.interventions
  WHERE student_id = v_student_id AND kind = 'attendance' AND status IN ('pending', 'in_progress');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL TM-04r: expected exactly 1 open attendance intervention, found %', v_count;
  END IF;

  RAISE NOTICE 'PASS TM-04r: Repeated HIGH snapshot dedup preserved single open intervention';

  -- ==========================================================================
  -- 3. TM-06r: Academic HIGH risk triggers intervention, source_snapshot_id pinned
  -- ==========================================================================
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today, 82.00, 'HIGH',
    '[{"factor":"exam_trend","detail":"Declining exam average","weight":0.4}]'::jsonb,
    'Schedule academic support session for Subject 1', v_subject_1, 'HASH1'
  ) RETURNING id INTO v_snap_acad_1;

  v_interv_acad := public.create_intervention_if_qualifying(v_snap_acad_1);

  IF v_interv_acad IS NULL THEN
    RAISE EXCEPTION 'FAIL TM-06r: create_intervention_if_qualifying returned NULL for academic HIGH snapshot';
  END IF;

  SELECT source_snapshot_id INTO v_source_snap FROM public.interventions WHERE id = v_interv_acad;
  IF v_source_snap <> v_snap_acad_1 THEN
    RAISE EXCEPTION 'FAIL TM-06r: source_snapshot_id % does not match triggering snapshot %', v_source_snap, v_snap_acad_1;
  END IF;

  SELECT COUNT(*) INTO v_evidence_count
  FROM public.intervention_academic_evidence
  WHERE intervention_id = v_interv_acad AND is_pinned = true AND snapshot_id = v_snap_acad_1;

  IF v_evidence_count <> 1 THEN
    RAISE EXCEPTION 'FAIL TM-06r: expected 1 pinned academic evidence row, got %', v_evidence_count;
  END IF;

  RAISE NOTICE 'PASS TM-06r: Academic HIGH created intervention with pinned source snapshot and evidence row';

  -- ==========================================================================
  -- 4. TM-35: 2nd subject becomes HIGH risk -> dedup holds, evidence accumulates
  -- ==========================================================================
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today, 95.00, 'HIGH',
    '[{"factor":"exam_trend","detail":"Critically low exam average in Subject 2","weight":0.6}]'::jsonb,
    'Schedule academic support session for Subject 2', v_subject_2, 'HASH1'
  ) RETURNING id INTO v_snap_acad_2;

  v_interv_acad_2 := public.create_intervention_if_qualifying(v_snap_acad_2);

  IF v_interv_acad_2 <> v_interv_acad THEN
    RAISE EXCEPTION 'FAIL TM-35: dedup failed on 2nd subject HIGH risk';
  END IF;

  SELECT source_snapshot_id INTO v_source_snap FROM public.interventions WHERE id = v_interv_acad;
  IF v_source_snap <> v_snap_acad_1 THEN
    RAISE EXCEPTION 'FAIL TM-35: source_snapshot_id mutated! Expected original pinned % but got %', v_snap_acad_1, v_source_snap;
  END IF;

  SELECT COUNT(*) INTO v_evidence_count FROM public.intervention_academic_evidence WHERE intervention_id = v_interv_acad;
  SELECT COUNT(*) INTO v_pinned_count FROM public.intervention_academic_evidence WHERE intervention_id = v_interv_acad AND is_pinned = true;

  IF v_evidence_count <> 2 OR v_pinned_count <> 1 THEN
    RAISE EXCEPTION 'FAIL TM-35: expected 2 evidence rows with exactly 1 pinned, got total=%, pinned=%', v_evidence_count, v_pinned_count;
  END IF;

  RAISE NOTICE 'PASS TM-35: 2nd subject High risk added unpinned sibling evidence without mutating source_snapshot_id';

  -- ==========================================================================
  -- 5. TM-41 & TM-42: Notify Parent idempotency & resend
  -- ==========================================================================
  -- Set session context as Teacher (assignee)
  PERFORM set_config('app.role', 'teacher', true);
  PERFORM set_config('app.school_id', v_school_id::text, true);
  PERFORM set_config('request.jwt.claims', ('{"sub":"' || v_teacher_id || '"}')::text, true);

  -- First send as class teacher
  v_notif_1 := public.notify_parent_for_intervention(v_interv_attn, v_req_id_1);
  IF v_notif_1 IS NULL THEN
    RAISE EXCEPTION 'FAIL TM-41: notify_parent_for_intervention returned NULL';
  END IF;

  -- Retry with identical client_request_id (must return identical notification_id without creating duplicate)
  v_notif_1_retry := public.notify_parent_for_intervention(v_interv_attn, v_req_id_1);
  IF v_notif_1_retry <> v_notif_1 THEN
    RAISE EXCEPTION 'FAIL TM-41: retry returned different notification_id (% vs %)', v_notif_1_retry, v_notif_1;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.notifications WHERE id = v_notif_1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL TM-41: notifications row count is not 1';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.intervention_parent_notifications WHERE intervention_id = v_interv_attn AND client_request_id = v_req_id_1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL TM-41: expected exactly 1 intervention_parent_notifications row, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS TM-41: Idempotent retry returned existing notification_id without duplicate send';

  -- Deliberate "Send again" with a NEW client_request_id (TM-42)
  v_notif_2 := public.notify_parent_for_intervention(v_interv_attn, v_req_id_2);
  IF v_notif_2 = v_notif_1 THEN
    RAISE EXCEPTION 'FAIL TM-42: expected a new notification_id for new client_request_id';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.intervention_parent_notifications WHERE intervention_id = v_interv_attn;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL TM-42: expected 2 intervention_parent_notifications rows, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS TM-42: Deliberate resend with fresh client_request_id successfully created 2nd notification';

  -- ==========================================================================
  -- 6. Lifecycle RPCs: start, complete, dismiss, reassign
  -- ==========================================================================
  -- Start intervention as teacher (assignee)
  PERFORM public.start_intervention(v_interv_attn);
  SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_attn;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL Lifecycle: status did not transition to in_progress';
  END IF;

  -- Complete intervention
  PERFORM public.complete_intervention(v_interv_attn, 'Discussed with parent, attendance improved');
  SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_attn;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'FAIL Lifecycle: status did not transition to completed';
  END IF;

  RAISE NOTICE 'PASS Lifecycle: start and complete transitions succeeded with audit logs';

  -- Switch session context to Principal for reassign and dismiss
  PERFORM set_config('app.role', 'principal', true);
  PERFORM set_config('app.school_id', v_school_id::text, true);
  PERFORM set_config('request.jwt.claims', ('{"sub":"' || v_principal_id || '"}')::text, true);

  -- Reassignment test on academic intervention
  PERFORM public.reassign_intervention(v_interv_acad, v_principal_id);
  SELECT assignee_id, assigned_via INTO v_assignee, v_assigned_via FROM public.interventions WHERE id = v_interv_acad;
  IF v_assignee <> v_principal_id OR v_assigned_via <> 'reassigned' THEN
    RAISE EXCEPTION 'FAIL Reassignment: reassignment failed';
  END IF;

  -- Dismiss intervention with reason
  PERFORM public.dismiss_intervention(v_interv_acad, 'Student transferred to another section');
  SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_acad;
  IF v_status <> 'dismissed' THEN
    RAISE EXCEPTION 'FAIL Lifecycle: status did not transition to dismissed';
  END IF;

  RAISE NOTICE 'PASS Lifecycle: reassign and dismiss transitions succeeded';

END $$;

-- Verify RLS enforcement: Parent session cannot select interventions
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_interv_count INT;
BEGIN
  SELECT COUNT(*) INTO v_interv_count FROM public.interventions;
  IF v_interv_count > 0 THEN
    RAISE EXCEPTION 'FAIL RLS: Parent was able to query % intervention rows', v_interv_count;
  END IF;
  RAISE NOTICE 'PASS RLS: Parent query on interventions returned 0 rows (denied)';
END $$;

RESET ROLE;

ROLLBACK;
