CREATE TABLE public.student_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL UNIQUE REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  blood_group text,
  allergies text,
  chronic_conditions text,
  current_medications text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  doctor_name text,
  doctor_phone text,
  special_notes text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_records_student ON public.student_health_records(student_id);
CREATE INDEX idx_health_records_school ON public.student_health_records(school_id);
