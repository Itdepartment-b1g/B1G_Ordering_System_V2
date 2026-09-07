-- Allow Sales Head to have a personal monthly sales target.
-- Run in Supabase SQL editor (idempotent).

ALTER TABLE public.key_account_monthly_sales_targets
  DROP CONSTRAINT IF EXISTS key_account_monthly_sales_targets_role_check;

ALTER TABLE public.key_account_monthly_sales_targets
  ADD CONSTRAINT key_account_monthly_sales_targets_role_check
    CHECK (assignee_role IN ('sales_head', 'sales_director', 'key_account_manager'));
