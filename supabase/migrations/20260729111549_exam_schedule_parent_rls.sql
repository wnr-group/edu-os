-- Parent read access to exam_schedule_slots — published datesheets only.
-- Combines with (does not replace) exam_schedule_slots_select_staff from ERP-69;
-- that policy already excludes parent/student, so this is the ONLY path a
-- parent has to these rows.
CREATE POLICY "exam_schedule_slots_parent_select" ON public.exam_schedule_slots FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND (SELECT datesheet_published_at FROM public.exams e WHERE e.id = exam_schedule_slots.exam_id) IS NOT NULL
    AND class_id IN (
      SELECT se.class_id FROM public.student_enrollments se
      JOIN public.student_profiles sp ON sp.id = se.student_profile_id
      WHERE sp.parent_profile_id = auth.uid()
    )
  );