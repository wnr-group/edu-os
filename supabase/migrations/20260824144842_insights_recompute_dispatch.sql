-- supabase/migrations/20260824144842_insights_recompute_dispatch.sql
--
-- Insights & Interventions V1 - Task #3: Nightly Risk Computation Infrastructure
--
-- Creates:
-- 1. increment_insight_run_counter - helper RPC for atomic counter updates
-- 2. insights_recompute_dispatch - pg_cron dispatcher that fans out to Edge Functions
-- 3. pg_cron schedule for nightly execution (01:00 IST = 19:30 UTC)
--
-- Architecture:
--   pg_cron (nightly)
--     ↓
--   insights_recompute_dispatch SQL function
--     ↓ queries schools WHERE feature_enabled('insights')
--     ↓ chunks students into batches of 1000
--     ↓ net.http_post for each chunk → insights-recompute Edge Function

-- ============================================================================
-- Helper Function: pg_advisory_xact_lock (for Edge Function use)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pg_advisory_xact_lock(
  p_school_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Acquire advisory lock using hashtext on school_id
  -- Lock is automatically released at transaction end
  PERFORM pg_advisory_xact_lock(hashtext(p_school_id::text));
END;
$$;

COMMENT ON FUNCTION public.pg_advisory_xact_lock IS
  'Acquires a transaction-scoped advisory lock for a school_id to prevent concurrent processing';

-- ============================================================================
-- Helper Function: increment_insight_run_counter
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_insight_run_counter(
  p_run_id UUID,
  p_counter TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_counter = 'students_processed' THEN
    UPDATE public.insight_runs
    SET students_processed = students_processed + 1
    WHERE id = p_run_id;
  ELSIF p_counter = 'students_failed' THEN
    UPDATE public.insight_runs
    SET students_failed = students_failed + 1
    WHERE id = p_run_id;
  ELSIF p_counter = 'students_total' THEN
    UPDATE public.insight_runs
    SET students_total = students_total + 1
    WHERE id = p_run_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_insight_run_counter IS
  'Atomically increments counters in insight_runs table (students_processed, students_failed, students_total)';

-- ============================================================================
-- Dispatcher Function: insights_recompute_dispatch
-- ============================================================================

CREATE OR REPLACE FUNCTION cron.insights_recompute_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_date DATE;
  v_school_id UUID;
  v_students_total INT;
  v_chunk_offset INT;
  v_num_chunks INT;
  v_functions_url TEXT;
  v_service_role_key TEXT;
  v_cron_secret TEXT;
  rec RECORD;
BEGIN
  -- Get today's date in IST timezone
  v_run_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  -- Retrieve Vault secrets (fail gracefully if missing)
  v_functions_url := public._vault_get('functions_url');
  v_service_role_key := public._vault_get('service_role_key');
  v_cron_secret := public._vault_get('cron_secret');

  IF v_functions_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE WARNING 'insights_recompute_dispatch: Vault secrets missing (functions_url or service_role_key)';
    RETURN;
  END IF;

  -- Query eligible schools (those with 'insights' feature flag enabled and active students)
  FOR rec IN
    SELECT se.school_id, COUNT(*) as students_total
    FROM public.student_enrollments se
    JOIN public.academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'active'
    WHERE se.is_active = true
      AND EXISTS (
        SELECT 1 FROM public.feature_flags ff
        WHERE ff.school_id = se.school_id
          AND ff.key = 'insights'
          AND ff.is_enabled = true
      )
    GROUP BY se.school_id
  LOOP
    v_school_id := rec.school_id;
    v_students_total := rec.students_total;

    -- Calculate number of chunks (1000 students per chunk)
    v_num_chunks := CEIL(v_students_total::numeric / 1000);

    -- Dispatch each chunk as a separate Edge Function invocation
    FOR v_chunk_offset IN 0..(v_num_chunks - 1) LOOP
      PERFORM net.http_post(
        url := v_functions_url || '/insights-recompute',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key,
          'x-cron-secret', v_cron_secret
        ),
        body := jsonb_build_object(
          'school_id', v_school_id,
          'run_date', v_run_date,
          'offset', v_chunk_offset * 1000,
          'limit', 1000
        )
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION cron.insights_recompute_dispatch IS
  'Nightly dispatcher for insights risk computation. Queries eligible schools and fans out to insights-recompute Edge Function in 1000-student chunks.';

-- ============================================================================
-- pg_cron Schedule
-- ============================================================================

-- Unschedule any existing job with the same name
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'insights-recompute-nightly';

-- Schedule nightly execution at 19:30 UTC (01:00 IST)
SELECT cron.schedule(
  'insights-recompute-nightly',
  '30 19 * * *',
  $$
  SELECT cron.insights_recompute_dispatch()
  WHERE public._vault_get('functions_url') IS NOT NULL
    AND public._vault_get('service_role_key') IS NOT NULL;
  $$
);
