-- Restrict teacher attendance writes to sections they are actually assigned to.
--
-- Before this, attendance_write only checked role + school_id, so ANY teacher
-- could mark attendance for ANY section in their school — the UI intended to
-- limit them to their own classes but the DB never enforced it. This scopes a
-- teacher's writes to sections where they are either the class teacher
-- (section_assignments) or teach a period (timetable) in the ACTIVE year.
--
-- school_admin / principal / super_admin keep school-wide write access.
--
-- SECURITY DEFINER so the check can read section_assignments/timetable even
-- though the caller is a teacher; auth.uid() still reflects the caller.

CREATE OR REPLACE FUNCTION public.can_write_section_attendance(p_section_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.section_assignments sa
    JOIN public.academic_years ay ON ay.id = sa.academic_year_id
    WHERE sa.section_id = p_section_id
      AND sa.class_teacher_id = auth.uid()
      AND ay.status = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.timetable tt
    JOIN public.academic_years ay ON ay.id = tt.academic_year_id
    WHERE tt.section_id = p_section_id
      AND tt.teacher_id = auth.uid()
      AND ay.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_section_attendance(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "attendance_write" ON public.attendance_records;

CREATE POLICY "attendance_write" ON public.attendance_records FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND school_id = public.get_my_school_id()
    )
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.can_write_section_attendance(section_id)
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND school_id = public.get_my_school_id()
    )
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.can_write_section_attendance(section_id)
    )
  );
