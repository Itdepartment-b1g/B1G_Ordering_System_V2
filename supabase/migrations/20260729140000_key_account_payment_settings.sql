-- ============================================================================
-- Key Account payment settings (separate from company_payment_settings)
-- One row per company; Sales Head write, Sales Director read
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.key_account_payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  gcash_number text,
  gcash_name text,
  gcash_qr_url text,
  cash_enabled boolean NOT NULL DEFAULT true,
  cheque_enabled boolean NOT NULL DEFAULT true,
  gcash_enabled boolean NOT NULL DEFAULT false,
  bank_transfer_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ka_payment_settings_company_id
  ON public.key_account_payment_settings(company_id);

CREATE INDEX IF NOT EXISTS idx_ka_payment_settings_created_by
  ON public.key_account_payment_settings(created_by);

COMMENT ON TABLE public.key_account_payment_settings IS
  'Key Account payment configuration (banks, GCash, method toggles). Separate from finance company_payment_settings.';

COMMENT ON COLUMN public.key_account_payment_settings.created_by IS
  'Profile that first created this settings row (Sales Head).';

CREATE OR REPLACE FUNCTION public.update_key_account_payment_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ka_payment_settings_updated_at ON public.key_account_payment_settings;
CREATE TRIGGER trigger_ka_payment_settings_updated_at
  BEFORE UPDATE ON public.key_account_payment_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_key_account_payment_settings_updated_at();

ALTER TABLE public.key_account_payment_settings ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "KA sales head can insert payment settings"
  ON public.key_account_payment_settings;
CREATE POLICY "KA sales head can insert payment settings"
  ON public.key_account_payment_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sales_head'
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "KA sales head can update payment settings"
  ON public.key_account_payment_settings;
CREATE POLICY "KA sales head can update payment settings"
  ON public.key_account_payment_settings
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sales_head'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sales_head'
    )
  );

-- Allow Sales Head to upload/update/delete QR images in payment-qr-codes
DROP POLICY IF EXISTS "Sales head can upload KA payment QR codes" ON storage.objects;
CREATE POLICY "Sales head can upload KA payment QR codes"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-qr-codes'
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'sales_head'
    )
  );

DROP POLICY IF EXISTS "Sales head can update KA payment QR codes" ON storage.objects;
CREATE POLICY "Sales head can update KA payment QR codes"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'payment-qr-codes'
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'sales_head'
    )
  )
  WITH CHECK (
    bucket_id = 'payment-qr-codes'
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'sales_head'
    )
  );

DROP POLICY IF EXISTS "Sales head can delete KA payment QR codes" ON storage.objects;
CREATE POLICY "Sales head can delete KA payment QR codes"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-qr-codes'
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'sales_head'
    )
  );
