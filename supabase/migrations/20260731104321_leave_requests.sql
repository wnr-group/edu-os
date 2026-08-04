CREATE TYPE public.leave_type AS ENUM ('sick', 'casual', 'other');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.leave_session_scope AS ENUM ('FULL_DAY');

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  from_date date NOT NULL,
  to_date date NOT NULL,
  session_scope public.leave_session_scope NOT NULL DEFAULT 'FULL_DAY',
  leave_type public.leave_type NOT NULL,
  note text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

CREATE INDEX idx_leave_requests_school ON public.leave_requests(school_id);
CREATE INDEX idx_leave_requests_student ON public.leave_requests(student_id);
CREATE INDEX idx_leave_requests_lookup ON public.leave_requests(student_id, status, from_date, to_date);

-- Base table grant — RLS below governs which rows, this governs whether the
-- table is reachable at all (learned from earlier grant misses this epic).
GRANT SELECT ON public.leave_requests TO authenticated;