-- Testing (quizzes) — sub-project #6. Force-submits attempts whose window/
-- duration has elapsed and auto-closes quizzes past closes_at. Pure DB
-- mutation (no edge function, no Vault secret) — unlike the reminder crons
-- (20240001000050, 20260729111426) this doesn't call out, so no
-- app.settings.* / _vault_get() guard is needed. pg_cron does not fire on
-- the local CLI stack (per 20240001000050's note); the job is registered
-- here anyway for parity with the deployed project. pg_cron/pg_net were
-- already enabled by 20240001000050, no need to re-create the extension.
-- See docs/superpowers/plans/2026-08-14-testing-implementation.md (Task 8).

-- Defensive: drop any pre-existing job of this name so re-applying the
-- migration never creates a duplicate (older pg_cron does not upsert by name).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'testing-force-submit-expired';

-- Every 5 minutes — tight enough that a student never sees a stale
-- "in progress" quiz for long after its window closes.
SELECT cron.schedule(
  'testing-force-submit-expired',
  '*/5 * * * *',
  $$SELECT public.force_submit_expired_attempts()$$
);
