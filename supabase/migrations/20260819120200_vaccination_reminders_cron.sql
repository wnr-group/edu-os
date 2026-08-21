-- Daily vaccination-due reminders. Uses the same Vault-driven pg_cron/pg_net
-- pattern as 20240001000054_cron_vault_rework.sql — the earlier
-- app.settings.* GUC approach (as originally used by
-- 20240001000053_birthday_wishes_cron.sql, before that rework) does NOT work
-- on managed Supabase: app.settings.* cannot be set there (permission denied
-- even as postgres), so current_setting(...) always returns NULL and the
-- job silently never fires. This job is written directly against
-- public._vault_get(), skipping the superseded GUC pattern entirely.
--
-- Required Vault secrets (same ones already used by the homework/birthday
-- jobs — seed once via the deployed project's SQL Editor, see
-- 20240001000054's deploy note): functions_url, service_role_key, cron_secret.
-- If any is missing, vault_get() returns NULL and the job no-ops safely.
-- Locally, pg_cron does not fire at all on the CLI stack.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'student-vaccination-reminders';

-- Runs daily at 02:00 UTC (~07:30 IST), just ahead of the homework/birthday jobs.
SELECT cron.schedule(
  'student-vaccination-reminders',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := public._vault_get('functions_url') || '/send-vaccination-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public._vault_get('service_role_key'),
      'x-cron-secret', public._vault_get('cron_secret')
    ),
    body := '{}'::jsonb
  )
  WHERE public._vault_get('functions_url') IS NOT NULL
    AND public._vault_get('service_role_key') IS NOT NULL;
  $$
);
