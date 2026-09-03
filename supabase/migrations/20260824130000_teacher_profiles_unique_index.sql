-- Deduplicate existing teacher_profiles, keeping the oldest record per (school_id, profile_id)
DELETE FROM public.teacher_profiles t
USING public.teacher_profiles keep
WHERE t.school_id = keep.school_id
  AND t.profile_id = keep.profile_id
  AND t.created_at > keep.created_at;

-- Enforce unique constraint so duplicate teacher profiles can never be inserted
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_profiles_school_profile
  ON public.teacher_profiles (school_id, profile_id);
