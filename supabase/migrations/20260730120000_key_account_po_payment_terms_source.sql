-- Snapshot payment term source + catalog creator on Key Account POs

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS key_account_payment_terms_source text,
  ADD COLUMN IF NOT EXISTS key_account_payment_terms_created_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_key_account_payment_terms_source_check'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_key_account_payment_terms_source_check
      CHECK (
        key_account_payment_terms_source IS NULL
        OR key_account_payment_terms_source IN ('client', 'company', 'custom')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_ka_payment_terms_created_by
  ON public.purchase_orders(key_account_payment_terms_created_by);

COMMENT ON COLUMN public.purchase_orders.key_account_payment_terms_source IS
  'Origin of key_account_payment_terms: client profile, company catalog, or custom for this PO.';

COMMENT ON COLUMN public.purchase_orders.key_account_payment_terms_created_by IS
  'Profile that created the term (company catalog creator, or PO author for custom). Null for client-profile terms.';
