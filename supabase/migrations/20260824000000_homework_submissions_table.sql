-- supabase/migrations/20260824000000_homework_submissions_table.sql
--
-- Parent-uploaded homework submissions. ONE row per (homework, student),
-- upserted in place on re-submission — mirrors homework_status's shape
-- (20240001000047_homework_status.sql) and kyc_documents' upsert-by-replace
-- semantics. All writes go through submit_homework() (next migration);
-- clients get NO direct INSERT/UPDATE/DELETE, same convention as
-- homework_status.

CREATE TABLE public.homework_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  homework_id   UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  submitted_by  UUID NOT NULL REFERENCES auth.users(id),
  file_path     TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT NOT NULL CHECK (file_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  file_size     INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (homework_id, student_id)
);

CREATE INDEX idx_homework_submissions_homework ON public.homework_submissions(homework_id);
CREATE INDEX idx_homework_submissions_student  ON public.homework_submissions(student_id);

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

-- SELECT only: parent-of-student, or staff, or the teacher assigned to the
-- homework's section. Mirrors homework_status_select exactly, plus the
-- teacher branch (homework_status's SELECT policy already covers teacher via
-- get_my_role() = 'teacher' AND school match, which is coarser than section
-- match — this table intentionally requires teaches_homework_section for the
-- teacher branch since submissions are more sensitive student work product).
CREATE POLICY "homework_submissions_select" ON public.homework_submissions FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'homework')
      AND school_id = public.get_my_school_id()
      AND (
        public.get_my_role() IN ('school_admin', 'principal')
        OR (public.get_my_role() = 'teacher' AND public.teaches_homework_section(homework_id))
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = homework_submissions.student_id
            AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

-- NO INSERT / UPDATE / DELETE policies. RLS is deny-by-default; all writes
-- go through submit_homework() (SECURITY DEFINER, next migration).
