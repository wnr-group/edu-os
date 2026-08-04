CREATE TYPE public.kyc_subject_type AS ENUM ('student', 'staff'); -- 'staff' defined now, unused in v1
CREATE TYPE public.kyc_doc_status AS ENUM ('submitted', 'verified', 'rejected', 'expired'); -- 'expired' derived on-read only, never stored

CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_type public.kyc_subject_type NOT NULL DEFAULT 'student',
  name text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  expires boolean NOT NULL DEFAULT false,
  default_validity_months integer,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doctype_school ON public.document_types(school_id, subject_type, is_active);

CREATE TABLE public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_type public.kyc_subject_type NOT NULL DEFAULT 'student',
  subject_id uuid NOT NULL, -- student_profiles.id; NO hard FK (polymorphic; RPC validates)
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  file_path text NOT NULL,  -- storage OBJECT PATH, not a public URL
  file_name text NOT NULL,
  file_type text,
  file_size integer CHECK (file_size > 0 AND file_size <= 5242880), -- 5 MB
  status public.kyc_doc_status NOT NULL DEFAULT 'submitted',
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  rejection_reason text,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, subject_type, subject_id, document_type_id)
);
CREATE INDEX idx_kyc_subject ON public.kyc_documents(school_id, subject_type, subject_id);
CREATE INDEX idx_kyc_status ON public.kyc_documents(school_id, status);

GRANT SELECT ON public.document_types TO authenticated;
GRANT SELECT ON public.kyc_documents TO authenticated;