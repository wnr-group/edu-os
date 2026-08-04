-- Fee status (ERP-71): read-only rollup view, no new storage, no cron.
-- overdue is derived on every read (outstanding>0 AND earliest unpaid due < today) —
-- never persisted, so it's always accurate with zero maintenance (per D15/C.1).

CREATE OR REPLACE VIEW public.student_fee_status
WITH (security_invoker = true) AS
WITH paid AS (
  SELECT lip.line_item_id, SUM(lip.amount_applied) AS amount_applied
  FROM public.line_item_payments lip
  GROUP BY lip.line_item_id
)
SELECT
  fli.student_id,
  fli.school_id,
  fli.academic_year_id,
  fli.class_id,
  sp.full_name AS student_name,
  c.name AS class_name,
  SUM(fli.total_amount)::numeric(12,2) AS total_billed,
  COALESCE(SUM(paid.amount_applied), 0)::numeric(12,2) AS total_paid,
  (SUM(fli.total_amount) - COALESCE(SUM(paid.amount_applied), 0))::numeric(12,2) AS outstanding,
  MIN(fli.due_date) FILTER (WHERE fli.status <> 'paid') AS earliest_unpaid_due,
  (
    (SUM(fli.total_amount) - COALESCE(SUM(paid.amount_applied), 0)) > 0
    AND MIN(fli.due_date) FILTER (WHERE fli.status <> 'paid') < CURRENT_DATE
  ) AS is_overdue,
  GREATEST(
    0,
    CURRENT_DATE - MIN(fli.due_date) FILTER (WHERE fli.status <> 'paid')
  )::int AS days_overdue
FROM public.fee_line_items fli
JOIN public.student_profiles sp ON sp.id = fli.student_id
LEFT JOIN public.classes c ON c.id = fli.class_id
LEFT JOIN paid ON paid.line_item_id = fli.id
GROUP BY fli.student_id, fli.school_id, fli.academic_year_id, fli.class_id, sp.full_name, c.name;

-- security_invoker means this view runs with the QUERYING user's own RLS —
-- admin sees the whole school, a parent would only see their own child — same
-- as the fee_line_items policies from ERP-62, no new policy needed. Requires
-- Postgres 15+; if your Supabase project is on an older version, this syntax
-- will fail at CREATE VIEW time (not silently) — worth confirming your PG
-- version before running this if you're unsure.
GRANT SELECT ON public.student_fee_status TO authenticated;