-- PTM Phase 2 — day-before reminder cron. Mirrors 20260729111426_exam_reminder_cron.sql exactly.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ptm-reminders';

SELECT cron.schedule(
  'ptm-reminders',
  '35 2 * * *',
  $$
  SELECT net.http_post(
    url := public._vault_get('functions_url') || '/send-ptm-reminders',
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
