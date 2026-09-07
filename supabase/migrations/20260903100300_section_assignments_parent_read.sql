-- Fix: parent was never in section_assignments_read's allowed roles, so a
-- parent's client-side lookup of their child's class_teacher_id (mobile
-- "Message Teacher") silently returned no rows under RLS (filtered, not
-- errored) rather than the real teacher — the feedback row was then
-- inserted with to_user_id = NULL, which could never match the teacher's
-- own to_user_id = auth.uid() query on their Feedback page. Scoped tightly:
-- a parent can only read the class_teacher_id for a section their own
-- actively-enrolled child belongs to, not the whole school's assignments.
DROP POLICY IF EXISTS "section_assignments_read" ON public.section_assignments;
CREATE POLICY "section_assignments_read" ON public.section_assignments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal', 'teacher')
      AND school_id = public.get_my_school_id()
    )
    OR (
      public.get_my_role() = 'parent'
      AND EXISTS (
        SELECT 1 FROM public.student_enrollments se
        JOIN public.student_profiles sp ON sp.id = se.student_profile_id
        WHERE se.section_id = section_assignments.section_id
          AND se.is_active = true
          AND sp.parent_profile_id = auth.uid()
      )
    )
  );
