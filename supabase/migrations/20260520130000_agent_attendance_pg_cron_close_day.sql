-- Daily close-out: 00:05 Asia/Manila → mark previous Manila calendar day absent (Mon–Sat) or non_working (Sun).
-- pg_cron on Supabase runs in UTC: 00:05 PH = 16:05 UTC (PH is UTC+8, no DST).
-- Requires pg_cron enabled (Database → Extensions). Re-running this migration replaces the job with the same name.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'mark_agent_absent_previous_manila_day',
  '5 16 * * *',
  $cron$
SELECT public.mark_absent_attendance_for_business_date(
  ((now() AT TIME ZONE 'Asia/Manila')::date - 1)
);
$cron$
);
