-- Add status column to discipline_records
ALTER TABLE public.discipline_records
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Constrain status to valid review states
ALTER TABLE public.discipline_records
  DROP CONSTRAINT IF EXISTS discipline_records_status_check,
  ADD CONSTRAINT discipline_records_status_check CHECK (status IN ('pending', 'reviewed'));


