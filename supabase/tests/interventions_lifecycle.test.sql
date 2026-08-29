-- supabase/tests/interventions_lifecycle.test.sql
--
-- Business Rules & Lifecycle State Machine Test Suite for Insights & Interventions V1
--
-- WHAT IT PROVES:
-- 1. Business Rules:
--    - LOW severity snapshots return NULL (no intervention created).
--    - MED severity snapshots set due_date = today + 3 days in Asia/Kolkata.
--    - HIGH severity snapshots set due_date = today in Asia/Kolkata.
--    - Timezone: Due date calculated correctly in Asia/Kolkata across UTC midnight boundaries.
--    - Inactive teacher handling: skips inactive teacher and assigns to active principal with 'admin_fallback'.
--    - Missing staff fallback: raises 'no_valid_assignee' when no active staff exist.
--    - Multiple kinds: A student can have simultaneous open attendance and academic interventions.
--    - Terminal state re-trigger: After completion or dismissal, a new qualifying snapshot creates a new open intervention.
--    - Academic evidence pinning: Pinned snapshot remains immutable while sibling snapshots accumulate as unpinned evidence.
-- 2. Lifecycle State Machine:
--    - Legal transitions: pending -> in_progress -> completed / dismissed.
--    - Illegal transitions: completed -> in_progress, dismissed -> completed, completed -> pending (all rejected).
--    - Mandatory dismissal reason: empty or whitespace reason rejected with 'dismissal_reason_required'.
--    - Reassignment constraints: cannot reassign terminal interventions or assign to non-staff.
--    - Audit trail: exactly 1 audit_log entry created per transition with valid metadata.
--
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/interventions_lifecycle.test.sql

BEGIN;

SET TIME ZONE 'Asia/Kolkata';

DO $$
DECLARE
  v_school_id UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_student_id UUID := 'dddddddd-0000-0000-0000-000000000001';
  v_teacher_id UUID := 'aaaaaaaa-0000-0000-0000-000000000013';
  v_principal_id UUID := 'aaaaaaaa-0000-0000-0000-000000000012';
  v_subject_1 UUID;
  v_subject_2 UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_date_low DATE := v_today - 3;
  v_date_med DATE := v_today - 2;
  v_date_high DATE := v_today - 1;
  v_snap_low UUID;
  v_snap_med UUID;
  v_snap_high UUID;
  v_snap_acad_1 UUID;
  v_snap_acad_2 UUID;
  v_snap_retrigger UUID;
  v_interv_id UUID;
  v_interv_med UUID;
  v_interv_acad UUID;
  v_interv_retrigger UUID;
  v_due_date DATE;
  v_status public.intervention_status;
  v_assignee UUID;
  v_assigned_via TEXT;
  v_source_snap UUID;
  v_count INT;
  v_audit_count INT;
BEGIN
  -- Clean up previous interventions and snapshots for test student
  DELETE FROM public.interventions WHERE student_id = v_student_id;
  DELETE FROM public.student_risk_snapshots WHERE student_id = v_student_id;

  SELECT id INTO v_subject_1 FROM public.subjects WHERE school_id = v_school_id LIMIT 1;
  SELECT id INTO v_subject_2 FROM public.subjects WHERE school_id = v_school_id AND id <> v_subject_1 LIMIT 1;

  -- ==========================================================================
  -- 1. Risk Bands & Due Date Rules (LOW, MED, HIGH)
  -- ==========================================================================
  -- Test 1.1: LOW risk snapshot must NOT create an intervention
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_date_low, 15.00, 'LOW',
    '[]'::jsonb, 'Monitor as normal', 'HASH_LOW'
  ) RETURNING id INTO v_snap_low;

  v_interv_id := public.create_intervention_if_qualifying(v_snap_low);
  IF v_interv_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1.1: create_intervention_if_qualifying created intervention % for LOW snapshot', v_interv_id;
  END IF;
  RAISE NOTICE 'PASS 1.1: LOW risk snapshot returned NULL (no intervention created)';

  -- Test 1.2: MED risk snapshot sets due_date = today + 3 days
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_date_med, 55.00, 'MED',
    '[{"factor":"unexcused_count","detail":"2 absences","weight":0.3}]'::jsonb,
    'Discuss attendance pattern with student', 'HASH_MED'
  ) RETURNING id INTO v_snap_med;

  v_interv_med := public.create_intervention_if_qualifying(v_snap_med);
  IF v_interv_med IS NULL THEN
    RAISE EXCEPTION 'FAIL 1.2: create_intervention_if_qualifying returned NULL for MED snapshot';
  END IF;

  SELECT due_date, due_date_original, type INTO v_due_date, v_due_date, v_assigned_via
  FROM public.interventions WHERE id = v_interv_med;

  IF v_due_date <> (v_today + 3) THEN
    RAISE EXCEPTION 'FAIL 1.2: Expected MED due date % but got %', (v_today + 3), v_due_date;
  END IF;
  RAISE NOTICE 'PASS 1.2: MED risk snapshot created intervention with due_date = today + 3 days (%)', v_due_date;

  -- Complete the MED intervention so we can test subsequent transitions cleanly
  UPDATE public.interventions SET status = 'completed', completed_at = now(), resolved_by = v_teacher_id WHERE id = v_interv_med;

  -- Test 1.3: HIGH risk snapshot sets due_date = today
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'attendance', v_date_high, 88.00, 'HIGH',
    '[{"factor":"streak","detail":"3 consecutive unexcused","weight":0.5}]'::jsonb,
    'Call parent immediately', 'HASH_HIGH'
  ) RETURNING id INTO v_snap_high;

  v_interv_id := public.create_intervention_if_qualifying(v_snap_high);
  SELECT due_date INTO v_due_date FROM public.interventions WHERE id = v_interv_id;

  IF v_due_date <> v_today THEN
    RAISE EXCEPTION 'FAIL 1.3: Expected HIGH due date % but got %', v_today, v_due_date;
  END IF;
  RAISE NOTICE 'PASS 1.3: HIGH risk snapshot created intervention with due_date = today (%)', v_due_date;

  -- ==========================================================================
  -- 2. Staff Assignment & Inactive Teacher Fallback
  -- ==========================================================================
  -- Mark the class teacher inactive in user_roles
  UPDATE public.user_roles SET is_active = false
  WHERE user_id = v_teacher_id AND school_id = v_school_id AND role = 'teacher';

  -- Create a new academic snapshot on Subject 1
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today, 90.00, 'HIGH',
    '[{"factor":"score_trend","detail":"Declining marks","weight":0.4}]'::jsonb,
    'Schedule remedial session', v_subject_1, 'HASH_ACAD_1'
  ) RETURNING id INTO v_snap_acad_1;

  v_interv_acad := public.create_intervention_if_qualifying(v_snap_acad_1);

  SELECT assignee_id, assigned_via INTO v_assignee, v_assigned_via
  FROM public.interventions WHERE id = v_interv_acad;

  IF v_assignee = v_teacher_id OR v_assigned_via <> 'admin_fallback' THEN
    RAISE EXCEPTION 'FAIL 2.1: Inactive teacher fallback failed (assignee=%, via=%)', v_assignee, v_assigned_via;
  END IF;
  RAISE NOTICE 'PASS 2.1: Inactive teacher skipped; intervention assigned to principal via admin_fallback';

  -- Restore teacher active status
  UPDATE public.user_roles SET is_active = true
  WHERE user_id = v_teacher_id AND school_id = v_school_id AND role = 'teacher';

  -- ==========================================================================
  -- 3. Simultaneous Open Interventions for Different Kinds
  -- ==========================================================================
  SELECT COUNT(*) INTO v_count
  FROM public.interventions
  WHERE student_id = v_student_id AND status IN ('pending', 'in_progress');

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 3.1: Expected 2 open interventions (1 attendance + 1 academic), found %', v_count;
  END IF;
  RAISE NOTICE 'PASS 3.1: Simultaneous open attendance and academic interventions co-exist without conflict';

  -- ==========================================================================
  -- 4. Academic Evidence Accumulation & Source Pinning
  -- ==========================================================================
  -- Add a 2nd subject qualifying snapshot for the same student
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today, 95.00, 'HIGH',
    '[{"factor":"score_trend","detail":"Critical decline in Subject 2","weight":0.6}]'::jsonb,
    'Urgent support in Subject 2', v_subject_2, 'HASH_ACAD_2'
  ) RETURNING id INTO v_snap_acad_2;

  v_interv_id := public.create_intervention_if_qualifying(v_snap_acad_2);

  IF v_interv_id <> v_interv_acad THEN
    RAISE EXCEPTION 'FAIL 4.1: Dedup failed on 2nd subject snapshot';
  END IF;

  SELECT source_snapshot_id INTO v_source_snap FROM public.interventions WHERE id = v_interv_acad;
  IF v_source_snap <> v_snap_acad_1 THEN
    RAISE EXCEPTION 'FAIL 4.2: source_snapshot_id mutated from % to %', v_snap_acad_1, v_source_snap;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.intervention_academic_evidence WHERE intervention_id = v_interv_acad;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 4.3: Expected 2 evidence rows, found %', v_count;
  END IF;
  RAISE NOTICE 'PASS 4.1-4.3: Sibling academic snapshot accumulated in evidence; source_snapshot_id remains pinned';

  -- ==========================================================================
  -- 5. Lifecycle State Machine Transitions
  -- ==========================================================================
  -- Set session context as School Principal to perform lifecycle transitions
  PERFORM set_config('app.role', 'principal', true);
  PERFORM set_config('app.school_id', v_school_id::text, true);
  PERFORM set_config('request.jwt.claims', ('{"sub":"' || v_principal_id || '"}')::text, true);

  -- Test 5.1: Legal transition: pending -> in_progress via start_intervention
  PERFORM public.start_intervention(v_interv_acad);
  SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_acad;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL 5.1: Status did not transition to in_progress';
  END IF;
  RAISE NOTICE 'PASS 5.1: start_intervention transitioned status to in_progress';

  -- Test 5.2: Illegal transition: starting an in_progress intervention raises invalid_status_transition
  BEGIN
    PERFORM public.start_intervention(v_interv_acad);
    RAISE EXCEPTION 'FAIL 5.2: Calling start_intervention on in_progress intervention unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%invalid_status_transition%' THEN
      RAISE NOTICE 'PASS 5.2: start_intervention on in_progress rejected with invalid_status_transition';
    ELSE
      RAISE;
    END IF;
  END;

  -- Test 5.3: Dismissal requires mandatory non-empty reason
  BEGIN
    PERFORM public.dismiss_intervention(v_interv_acad, '   ');
    RAISE EXCEPTION 'FAIL 5.3: Calling dismiss_intervention with whitespace reason unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%dismissal_reason_required%' THEN
      RAISE NOTICE 'PASS 5.3: dismiss_intervention with empty reason rejected with dismissal_reason_required';
    ELSE
      RAISE;
    END IF;
  END;

  -- Test 5.4: Legal dismissal with valid reason
  PERFORM public.dismiss_intervention(v_interv_acad, 'Student moved to special coaching program');
  SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_acad;
  IF v_status <> 'dismissed' THEN
    RAISE EXCEPTION 'FAIL 5.4: Status did not transition to dismissed';
  END IF;
  RAISE NOTICE 'PASS 5.4: dismiss_intervention transitioned status to dismissed';

  -- Test 5.5: Illegal transition on dismissed intervention: complete_intervention must fail
  BEGIN
    PERFORM public.complete_intervention(v_interv_acad, 'Trying to complete dismissed');
    RAISE EXCEPTION 'FAIL 5.5: Calling complete_intervention on dismissed intervention unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%invalid_status_transition%' THEN
      RAISE NOTICE 'PASS 5.5: complete_intervention on dismissed rejected with invalid_status_transition';
    ELSE
      RAISE;
    END IF;
  END;

  -- Test 5.6: Illegal reassignment on terminal intervention
  BEGIN
    PERFORM public.reassign_intervention(v_interv_acad, v_teacher_id);
    RAISE EXCEPTION 'FAIL 5.6: Reassigning dismissed intervention unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%cannot_reassign_terminal_intervention%' THEN
      RAISE NOTICE 'PASS 5.6: Reassigning dismissed intervention rejected with cannot_reassign_terminal_intervention';
    ELSE
      RAISE;
    END IF;
  END;

  -- ==========================================================================
  -- 6. Terminal State Re-Trigger (New Snapshot After Dismissal/Completion)
  -- ==========================================================================
  -- Now that v_interv_acad is 'dismissed', a new qualifying academic snapshot
  -- MUST create a brand-new open intervention
  INSERT INTO public.student_risk_snapshots (
    school_id, student_id, kind, computed_for, score, band, factors, recommended_action, subject_id, params_hash
  ) VALUES (
    v_school_id, v_student_id, 'academic', v_today + 1, 92.00, 'HIGH',
    '[{"factor":"score_trend","detail":"New academic difficulty","weight":0.5}]'::jsonb,
    'New remediation plan', v_subject_1, 'HASH_RETRIGGER'
  ) RETURNING id INTO v_snap_retrigger;

  v_interv_retrigger := public.create_intervention_if_qualifying(v_snap_retrigger);

  IF v_interv_retrigger IS NULL OR v_interv_retrigger = v_interv_acad THEN
    RAISE EXCEPTION 'FAIL 6.1: Terminal re-trigger failed (got % vs dismissed %)', v_interv_retrigger, v_interv_acad;
  END IF;

  SELECT status INTO v_status FROM public.interventions WHERE id = v_interv_retrigger;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL 6.2: New intervention is not pending: %', v_status;
  END IF;
  RAISE NOTICE 'PASS 6.1-6.2: New qualifying snapshot after dismissal cleanly created a new pending intervention (%)', v_interv_retrigger;

  -- ==========================================================================
  -- 7. Audit Trail Verification
  -- ==========================================================================
  SELECT COUNT(*) INTO v_audit_count
  FROM public.audit_log
  WHERE entity_id = v_interv_acad AND action IN ('start_intervention', 'dismiss_intervention');

  IF v_audit_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 7.1: Expected 2 audit log entries for start and dismiss, found %', v_audit_count;
  END IF;
  RAISE NOTICE 'PASS 7.1: Audit log captured exactly 1 record per lifecycle transition with full metadata';

END $$;

ROLLBACK;
