-- Add status column to discipline_records
ALTER TABLE public.discipline_records
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- RLS update policy for discipline_records for admin/principal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'discipline_records' AND policyname = 'discipline_records_update'
  ) THEN
    CREATE POLICY "discipline_records_update" ON public.discipline_records FOR UPDATE
      USING (
        public.get_my_role() IN ('super_admin', 'school_admin', 'principal')
      )
      WITH CHECK (
        public.get_my_role() IN ('super_admin', 'school_admin', 'principal')
      );
  END IF;
END $$;
