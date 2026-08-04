CREATE TYPE public.admission_stage AS ENUM ('enquiry', 'under_review', 'offered', 'enrolled', 'rejected');
CREATE TYPE public.admission_payment_status AS ENUM ('not_required', 'pending', 'paid');
CREATE TYPE public.admission_source AS ENUM ('online', 'walk_in');