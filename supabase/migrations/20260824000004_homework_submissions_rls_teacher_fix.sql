-- supabase/migrations/20260824000004_homework_submissions_rls_teacher_fix.sql
--
-- Widens the teacher branch of homework_submissions_select to also allow the
-- teacher who owns the homework (homework.teacher_id = auth.uid()), not only
-- teachers who appear in timetable/section_assignments (teaches_homework_section).
-- In schools where timetable or section_assignment rows are incomplete or the
-- active academic year diverges, the homework's own teacher was being denied
-- access to their own submissions roster by RLS — matching the same gap that
-- was fixed in the homework-submission-signed-url Edge Function.

DROP POLICY IF EXISTS "homework_submissions_select" ON public.homework_submissions;

CREATE POLICY "homework_submissions_select" ON public.homework_submissions FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'homework')
      AND school_id = public.get_my_school_id()
      AND (
        public.get_my_role() IN ('school_admin', 'principal')
        OR (
          public.get_my_role() = 'teacher'
          AND (
            public.teaches_homework_section(homework_id)
            OR EXISTS (
              SELECT 1 FROM public.homework h
              WHERE h.id = homework_submissions.homework_id
                AND h.teacher_id = auth.uid()
            )
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = homework_submissions.student_id
            AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );
