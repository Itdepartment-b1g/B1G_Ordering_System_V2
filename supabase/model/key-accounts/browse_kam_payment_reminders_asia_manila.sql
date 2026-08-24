-- Browse KA payment reminders with Asia/Manila wall-clock times.
-- Storage remains UTC on key_account_notification_sent_at (timestamptz).
-- Optional session display: SET TIME ZONE 'Asia/Manila';

SELECT
  po_number,
  key_account_notification_option,
  key_account_notification_date,
  key_account_notification_sent_at AS sent_at_utc,
  key_account_notification_sent_at AT TIME ZONE 'Asia/Manila' AS sent_at_manila
FROM public.purchase_orders
WHERE company_account_type = 'Key Accounts'
  AND key_account_notification_option IS NOT NULL
  AND key_account_notification_option <> 'none'
ORDER BY key_account_notification_date DESC NULLS LAST,
         key_account_notification_sent_at DESC NULLS LAST
LIMIT 100;
