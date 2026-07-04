-- Scope teacher writes to the classes/sections/students they actually teach.
--
-- Companion to migration 059 (which did this for attendance). Before this,
-- homework_write / exam_results_write / discipline_write / syllabus_write only
-- checked role + school_id, so ANY teacher could post homework, enter marks,
-- log discipline, or upload syllabus for ANY section in their school — the UI
-- implied "your classes only" but the DB never enforced it.
--
-- school_admin / principal / super_admin keep their existing school-wide access.
-- Only the 'teacher' branch is tightened.
--
-- Scope is derived from the ACTIVE year's assignments:
--   * teaches_section — homeroom (section_assignments) OR period (timetable).
--   * teaches_student — the student's active-year enrollment section, via teaches_section.
--   * teaches_class   — any active-year section of that class, via teaches_section.
-- (exam_results.student_id and discipline_records.student_id both reference
-- student_profiles(id) after migrations 017/018, so they join student_enrollments.)
--
-- All SECURITY DEFINER so the checks can read assignment tables even though the
-- caller is a teacher; auth.uid() still reflects the caller, and nested
-- SECURITY DEFINER calls preserve it.

CREATE OR REPLACE FUNCTION public.teaches_section(p_section_id uuid)
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

CREATE OR REPLACE FUNCTION public.teaches_student(p_student_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_enrollments se
    JOIN public.academic_years ay ON ay.id = se.academic_year_id
    WHERE se.student_profile_id = p_student_profile_id
      AND se.is_active = true
      AND ay.status = 'active'
      AND public.teaches_section(se.section_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.teaches_class(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sections s
    JOIN public.academic_years ay ON ay.id = s.academic_year_id
    WHERE s.class_id = p_class_id
      AND ay.status = 'active'
      AND public.teaches_section(s.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.teaches_section(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teaches_class(uuid)   TO authenticated, service_role;

-- ── HOMEWORK (has section_id) ───────────────────────────────────────────────
DROP POLICY IF EXISTS "homework_write" ON public.homework;
CREATE POLICY "homework_write" ON public.homework FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_section(section_id)
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_section(section_id)
    )
  );

-- ── EXAM_RESULTS (has student_id → student_profiles) ────────────────────────
DROP POLICY IF EXISTS "exam_results_write" ON public.exam_results;
CREATE POLICY "exam_results_write" ON public.exam_results FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_student(student_id)
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_student(student_id)
    )
  );

-- ── DISCIPLINE_RECORDS (has student_id → student_profiles) ──────────────────
DROP POLICY IF EXISTS "discipline_write" ON public.discipline_records;
CREATE POLICY "discipline_write" ON public.discipline_records FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_student(student_id)
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() IN ('school_admin', 'principal') AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_student(student_id)
    )
  );

-- ── SYLLABUS (has class_id) ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "syllabus_write" ON public.syllabus;
CREATE POLICY "syllabus_write" ON public.syllabus FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_class(class_id)
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    OR (
      public.get_my_role() = 'teacher'
      AND school_id = public.get_my_school_id()
      AND public.teaches_class(class_id)
    )
  );
