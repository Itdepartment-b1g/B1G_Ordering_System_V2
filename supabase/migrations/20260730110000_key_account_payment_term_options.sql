-- ============================================================================
-- Key Account company payment term options (catalog)
-- Sales Head + Sales Director manage; KA roles can read for PO create
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.key_account_payment_term_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT key_account_payment_term_options_label_not_blank
    CHECK (length(trim(label)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_payment_term_options_company_label_unique
  ON public.key_account_payment_term_options (company_id, lower(trim(label)));

CREATE INDEX IF NOT EXISTS idx_ka_payment_term_options_company_id
  ON public.key_account_payment_term_options(company_id);

CREATE INDEX IF NOT EXISTS idx_ka_payment_term_options_company_active
  ON public.key_account_payment_term_options(company_id, is_active, sort_order);

COMMENT ON TABLE public.key_account_payment_term_options IS
  'Company-managed Key Account payment term labels for PO selection. Separate from key_account_clients.payment_terms.';

CREATE OR REPLACE FUNCTION public.update_key_account_payment_term_options_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ka_payment_term_options_updated_at
  ON public.key_account_payment_term_options;
CREATE TRIGGER trigger_ka_payment_term_options_updated_at
  BEFORE UPDATE ON public.key_account_payment_term_options
  FOR EACH ROW
  EXECUTE FUNCTION public.update_key_account_payment_term_options_updated_at();

ALTER TABLE public.key_account_payment_term_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KA roles can view payment term options"
  ON public.key_account_payment_term_options;
CREATE POLICY "KA roles can view payment term options"
  ON public.key_account_payment_term_options
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

DROP POLICY IF EXISTS "KA sales head and director can insert payment term options"
  ON public.key_account_payment_term_options;
CREATE POLICY "KA sales head and director can insert payment term options"
  ON public.key_account_payment_term_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('sales_head', 'sales_director')
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "KA sales head and director can update payment term options"
  ON public.key_account_payment_term_options;
CREATE POLICY "KA sales head and director can update payment term options"
  ON public.key_account_payment_term_options
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('sales_head', 'sales_director')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('sales_head', 'sales_director')
    )
  );

DROP POLICY IF EXISTS "KA sales head and director can delete payment term options"
  ON public.key_account_payment_term_options;
CREATE POLICY "KA sales head and director can delete payment term options"
  ON public.key_account_payment_term_options
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('sales_head', 'sales_director')
    )
  );
