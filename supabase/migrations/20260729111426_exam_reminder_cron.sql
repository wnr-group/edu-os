-- Exam reminder cron (ERP-70). Mirrors 20240001000054_cron_vault_rework.sql exactly.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'exam-reminders';

SELECT cron.schedule(
  'exam-reminders',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url := public._vault_get('functions_url') || '/send-exam-reminders',
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