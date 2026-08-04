CREATE TABLE public.admission_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  is_open boolean NOT NULL DEFAULT false,
  application_fee integer NOT NULL DEFAULT 0, -- paise
  admission_academic_year_id uuid REFERENCES public.academic_years(id),
  next_ref_seq integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  reference_no text NOT NULL,
  applicant_name text NOT NULL,
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  class_applied_id uuid NOT NULL REFERENCES public.classes(id),
  parent_name text NOT NULL,
  parent_phone text NOT NULL,
  parent_email text,
  previous_school text,
  area text,
  applicant_note text,
  stage public.admission_stage NOT NULL DEFAULT 'enquiry',
  source public.admission_source NOT NULL DEFAULT 'online',
  assigned_to uuid REFERENCES auth.users(id),
  entrance_test_score numeric,
  docs_reviewed boolean NOT NULL DEFAULT false,
  docs_note text,
  internal_notes text,
  rejection_reason text,
  fee_amount integer NOT NULL DEFAULT 0,
  payment_status public.admission_payment_status NOT NULL DEFAULT 'not_required',
  razorpay_order_id text,
  razorpay_payment_id text,
  converted_student_id uuid REFERENCES public.student_profiles(id),
  converted_at timestamptz,
  submit_ip inet,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, reference_no)
);
CREATE INDEX idx_adm_app_school_stage ON public.admission_applications(school_id, stage);
CREATE INDEX idx_adm_app_phone_time ON public.admission_applications(parent_phone, created_at);
CREATE INDEX idx_adm_app_ip_time ON public.admission_applications(submit_ip, created_at);

CREATE TABLE public.admission_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.admission_applications(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  from_stage public.admission_stage,
  to_stage public.admission_stage NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_adm_event_app ON public.admission_stage_events(application_id, created_at);

-- Table-level grants — RLS (next migration) governs row visibility; this
-- governs whether the table is reachable at all. Explicit from the start,
-- learned from earlier grant misses this build.
GRANT SELECT ON public.admission_settings TO authenticated;
GRANT SELECT ON public.admission_applications TO authenticated;
GRANT SELECT ON public.admission_stage_events TO authenticated;
-- service_role needs these too (admission-submit, razorpay-webhook, convert route all use it)
GRANT SELECT, INSERT, UPDATE ON public.admission_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.admission_applications TO service_role;
GRANT SELECT, INSERT ON public.admission_stage_events TO service_role;