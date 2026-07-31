-- ============================================================================
-- Key Account payment settings: allow KAM/accounting read access + dynamic banks
-- Run after 20260729140000_key_account_payment_settings.sql
-- ============================================================================

-- Allow any bank name from key_account_payment_settings.bank_accounts (not just Unionbank/BPI/PBCOM)
ALTER TABLE public.purchase_order_key_account_payments
  DROP CONSTRAINT IF EXISTS purchase_order_key_account_payments_bank_type_check;

-- KAMs and accounting need read access when creating POs or recording payments
DROP POLICY IF EXISTS "KA sales head and director can view payment settings"
  ON public.key_account_payment_settings;
DROP POLICY IF EXISTS "KA roles can view payment settings"
  ON public.key_account_payment_settings;

CREATE POLICY "KA roles can view payment settings"
  ON public.key_account_payment_settings
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'sales_head',
          'sales_director',
          'sales_admin',
          'key_account_manager',
          'key_account_accounting'
        )
    )
  );
