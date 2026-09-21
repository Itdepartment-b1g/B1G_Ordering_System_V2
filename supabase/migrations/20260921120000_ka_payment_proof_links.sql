-- Excel PROOF OF PAYMENT can contain multiple Drive / HTTP links per payment.
-- Keep uploaded files on purchase_order_key_account_payments.proof_storage_path.

CREATE TABLE IF NOT EXISTS public.purchase_order_key_account_payment_proof_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES public.purchase_order_key_account_payments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT po_ka_payment_proof_links_url_check CHECK (external_url ~* '^https?://'),
  CONSTRAINT po_ka_payment_proof_links_payment_url_key UNIQUE (payment_id, external_url)
);

CREATE INDEX IF NOT EXISTS idx_po_ka_payment_proof_links_payment
  ON public.purchase_order_key_account_payment_proof_links(payment_id);

CREATE INDEX IF NOT EXISTS idx_po_ka_payment_proof_links_company
  ON public.purchase_order_key_account_payment_proof_links(company_id);

COMMENT ON TABLE public.purchase_order_key_account_payment_proof_links IS
  'External proof-of-payment URLs (Drive / hyperlinks) for a Key Account payment. Uploaded files stay on proof_storage_path.';

ALTER TABLE public.purchase_order_key_account_payment_proof_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KA PO payment proof links: tenant select"
  ON public.purchase_order_key_account_payment_proof_links;
CREATE POLICY "KA PO payment proof links: tenant select"
  ON public.purchase_order_key_account_payment_proof_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_order_key_account_payments pay
      JOIN public.purchase_orders po ON po.id = pay.purchase_order_id
      WHERE pay.id = purchase_order_key_account_payment_proof_links.payment_id
        AND pay.company_id = purchase_order_key_account_payment_proof_links.company_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = pay.company_id
        AND (
          po.kam_id = auth.uid()
          OR po.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.company_id = po.company_id
              AND (
                public.key_account_role_can_view_company_po(p.role)
                OR p.role = 'sales_director'
              )
          )
        )
    )
  );

DROP POLICY IF EXISTS "KA PO payment proof links: tenant insert"
  ON public.purchase_order_key_account_payment_proof_links;
CREATE POLICY "KA PO payment proof links: tenant insert"
  ON public.purchase_order_key_account_payment_proof_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_order_key_account_payments pay
      JOIN public.purchase_orders po ON po.id = pay.purchase_order_id
      WHERE pay.id = purchase_order_key_account_payment_proof_links.payment_id
        AND pay.company_id = purchase_order_key_account_payment_proof_links.company_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = pay.company_id
        AND public.key_account_user_may_record_po_payment(po.id, auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.purchase_order_key_account_payment_proof_links TO authenticated;
GRANT ALL ON public.purchase_order_key_account_payment_proof_links TO service_role;
