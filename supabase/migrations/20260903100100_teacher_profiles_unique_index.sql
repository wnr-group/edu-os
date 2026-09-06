-- Deduplicate existing teacher_profiles, keeping the most populated record per (school_id, profile_id)
DELETE FROM public.teacher_profiles t
USING public.teacher_profiles keep
WHERE t.school_id = keep.school_id
  AND t.profile_id = keep.profile_id
  AND (
        (COALESCE(array_length(t.subjects, 1), 0) + (t.class_teacher_of IS NOT NULL)::int,
         t.created_at, t.id)
      <
        (COALESCE(array_length(keep.subjects, 1), 0) + (keep.class_teacher_of IS NOT NULL)::int,
         keep.created_at, keep.id)
      );

-- Enforce unique constraint so duplicate teacher profiles can never be inserted
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_profiles_school_profile
  ON public.teacher_profiles (school_id, profile_id);

