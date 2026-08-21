-- Digital Student ID Card — revoke/reactivate RPCs.
--
-- Not a direct client-side table update: student_profiles_write already
-- allows 'teacher' to update this table (for ordinary profile edits), which
-- would let a teacher revoke a card too. These RPCs gate to
-- super_admin/school_admin/principal only (mirrors verify_documents'
-- authorization check exactly) and stamp revoked_by/revoked_at server-side
-- rather than trusting client-supplied values.

CREATE OR REPLACE FUNCTION public.revoke_student_id_card(p_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_status public.id_card_status;
BEGIN
  SELECT school_id, id_card_status INTO v_school_id, v_status
  FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status = 'revoked' THEN RETURN; END IF; -- already revoked, no-op

  UPDATE public.student_profiles
  SET id_card_status = 'revoked', id_card_revoked_at = now(), id_card_revoked_by = auth.uid()
  WHERE id = p_student_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'id_card.revoke', 'student_profiles', p_student_id);
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_student_id_card(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reactivate_student_id_card(p_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school_id uuid; v_status public.id_card_status;
BEGIN
  SELECT school_id, id_card_status INTO v_school_id, v_status
  FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF public.get_my_role() NOT IN ('super_admin', 'school_admin', 'principal') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF public.get_my_role() <> 'super_admin' AND v_school_id <> public.get_my_school_id() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status = 'active' THEN RETURN; END IF; -- already active, no-op

  UPDATE public.student_profiles
  SET id_card_status = 'active', id_card_revoked_at = NULL, id_card_revoked_by = NULL
  WHERE id = p_student_id;

  INSERT INTO public.audit_log (school_id, performed_by, acting_as_role, action, entity_type, entity_id)
  VALUES (v_school_id, auth.uid(), public.get_my_role(), 'id_card.reactivate', 'student_profiles', p_student_id);
END $$;
GRANT EXECUTE ON FUNCTION public.reactivate_student_id_card(uuid) TO authenticated;
