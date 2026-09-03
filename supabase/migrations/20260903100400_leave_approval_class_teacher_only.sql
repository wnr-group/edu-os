-- Product correction: leave approval/rejection is the class teacher's call,
-- not school_admin/principal's, and not "any teacher with a timetable slot
-- for this section" (teaches_student()/teaches_section() is broader than
-- that — it matches subject teachers too). Resolves the same
-- student -> active-year enrollment -> section -> class_teacher_id path
-- leave-notify already uses to pick the recipient, so the person authorized
-- to act and the person notified are provably the same identity. super_admin
-- keeps its bypass — a platform-operator override, not a school-staff role,
-- and every other RPC in this codebase preserves it uniformly.
--
-- Deliberately uses a direct user_roles lookup rather than get_my_role() for
-- the super_admin check (matching this same function's own prior fix
-- comment: the GUC-based role may not be populated identically for a direct
-- client-side .rpc() call the way it is for a full page navigation) — and
-- every boolean here is wrapped so a NULL anywhere (unresolved role,
-- unresolved section, unresolved comparison) fails closed (denies) rather
-- than silently skipping the check.
CREATE OR REPLACE FUNCTION public.approve_leave(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_from date;
  v_to date;
  v_status public.leave_status;
  v_school_id uuid;
  v_year_id uuid;
  v_section_id uuid;
  v_class_teacher_id uuid;
  v_is_super_admin boolean;
  v_is_school_staff boolean;
BEGIN
  SELECT lr.student_id, lr.from_date, lr.to_date, lr.status, lr.school_id
    INTO v_student, v_from, v_to, v_status, v_school_id
  FROM public.leave_requests lr WHERE lr.id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'leave') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true AND ur.role = 'super_admin'
  ) INTO v_is_super_admin;

  -- Restores the school-scoped school_admin/principal bypass main already
  -- had (the Admin/Principal Leave pages' Approve/Reject buttons call this
  -- RPC directly and have no other authorization path) — added alongside,
  -- not instead of, the class-teacher check below.
  v_is_school_staff := COALESCE(
    public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id(),
    false
  );

  IF NOT COALESCE(v_is_super_admin, false) AND NOT v_is_school_staff THEN
    SELECT ay.id INTO v_year_id FROM public.academic_years ay WHERE ay.school_id = v_school_id AND ay.status = 'active' LIMIT 1;
    SELECT se.section_id INTO v_section_id FROM public.student_enrollments se
      WHERE se.student_profile_id = v_student AND se.academic_year_id = v_year_id AND se.is_active = true;
    SELECT sa.class_teacher_id INTO v_class_teacher_id FROM public.section_assignments sa
      WHERE sa.section_id = v_section_id AND sa.academic_year_id = v_year_id;

    IF v_class_teacher_id IS NULL OR COALESCE(auth.uid() <> v_class_teacher_id, true) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;

  UPDATE public.attendance_records
  SET status = 'excused'
  WHERE student_id = v_student
    AND date BETWEEN v_from AND v_to;
END; $$;
REVOKE EXECUTE ON FUNCTION public.approve_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_leave(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid;
  v_status public.leave_status;
  v_school_id uuid;
  v_year_id uuid;
  v_section_id uuid;
  v_class_teacher_id uuid;
  v_is_super_admin boolean;
  v_is_school_staff boolean;
BEGIN
  SELECT lr.student_id, lr.status, lr.school_id INTO v_student, v_status, v_school_id
  FROM public.leave_requests lr WHERE lr.id = p_request_id;

  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT public.feature_enabled(v_school_id, 'leave') THEN RAISE EXCEPTION 'module_disabled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true AND ur.role = 'super_admin'
  ) INTO v_is_super_admin;

  v_is_school_staff := COALESCE(
    public.get_my_role() IN ('school_admin', 'principal') AND v_school_id = public.get_my_school_id(),
    false
  );

  IF NOT COALESCE(v_is_super_admin, false) AND NOT v_is_school_staff THEN
    SELECT ay.id INTO v_year_id FROM public.academic_years ay WHERE ay.school_id = v_school_id AND ay.status = 'active' LIMIT 1;
    SELECT se.section_id INTO v_section_id FROM public.student_enrollments se
      WHERE se.student_profile_id = v_student AND se.academic_year_id = v_year_id AND se.is_active = true;
    SELECT sa.class_teacher_id INTO v_class_teacher_id FROM public.section_assignments sa
      WHERE sa.section_id = v_section_id AND sa.academic_year_id = v_year_id;

    IF v_class_teacher_id IS NULL OR COALESCE(auth.uid() <> v_class_teacher_id, true) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  UPDATE public.leave_requests
  SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(p_reason), '')
  WHERE id = p_request_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reject_leave(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_leave(uuid, text) TO authenticated;
