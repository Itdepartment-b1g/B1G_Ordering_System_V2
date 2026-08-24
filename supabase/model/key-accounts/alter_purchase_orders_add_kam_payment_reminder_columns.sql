-- ALTER purchase_orders: add Key Account internal KAM payment-reminder columns.
-- Run in Supabase SQL editor (idempotent).
--
-- Adds:
--   key_account_notification_option   — preset (none, net_15, net_30, net_60, days_before_3, days_before_1, custom)
--   key_account_notification_date     — Manila calendar date to email the assigned KAM
--   key_account_notification_sent_at  — timestamptz stored in UTC; display as Asia/Manila in UI / SQL
--
-- Storage vs display:
--   - `timestamptz` is always stored in UTC (correct).
--   - App UI formats `sent_at` with timeZone: 'Asia/Manila'.
--   - In SQL Editor, either:
--       SET TIME ZONE 'Asia/Manila';
--     or browse with:
--       key_account_notification_sent_at AT TIME ZONE 'Asia/Manila' AS sent_at_manila
--     See browse_kam_payment_reminders_asia_manila.sql

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS key_account_notification_option text,
  ADD COLUMN IF NOT EXISTS key_account_notification_date date,
  ADD COLUMN IF NOT EXISTS key_account_notification_sent_at timestamptz;

COMMENT ON COLUMN public.purchase_orders.key_account_notification_option IS
  'Internal KAM pay-reminder preset: none, net_15, net_30, net_60, days_before_3, days_before_1, custom.';

COMMENT ON COLUMN public.purchase_orders.key_account_notification_date IS
  'Manila calendar date to email the assigned KAM about expected payment.';

COMMENT ON COLUMN public.purchase_orders.key_account_notification_sent_at IS
  'UTC timestamptz set after a successful internal reminder send. Display as Asia/Manila in UI/SQL. Not writable from the client.';
