-- Table shape only (DDL). Apply via SQL editor.
-- Query / allocation rules live in src/server/repositories/key-accounts/.
-- Access is via getSupabaseAdmin() (service role). RLS is on with no policies so
-- the authenticated/anon client cannot read or write this table directly.
--
-- Brand remaining is derived: line billed − allocated cash − allocated discount − pending
-- discount on those lines. Do not rewrite purchase_order_items.unit_price for concessions.

-- ---------------------------------------------------------------------------
-- 1) Payment → PO line allocations (cash and/or settlement discount)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_key_account_payment_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.purchase_order_key_account_payments(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  allocated_discount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_order_key_account_payment_allocations_amount_check
    CHECK (
      allocated_amount >= 0::numeric
      AND allocated_discount >= 0::numeric
      AND (allocated_amount > 0::numeric OR allocated_discount > 0::numeric)
    ),
  CONSTRAINT purchase_order_key_account_payment_allocations_payment_item_key
    UNIQUE (payment_id, purchase_order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ka_po_payment_alloc_payment
  ON public.purchase_order_key_account_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_ka_po_payment_alloc_item
  ON public.purchase_order_key_account_payment_allocations(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_ka_po_payment_alloc_company
  ON public.purchase_order_key_account_payment_allocations(company_id);

COMMENT ON TABLE public.purchase_order_key_account_payment_allocations IS
  'Key Account: which PO lines a payment (cash and/or settlement discount) covers. Brand remaining is grouped from these rows.';
COMMENT ON COLUMN public.purchase_order_key_account_payment_allocations.allocated_amount IS
  'Cash allocated to this PO line (not collected cash for other brands).';
COMMENT ON COLUMN public.purchase_order_key_account_payment_allocations.allocated_discount IS
  'Settlement discount allocated to this PO line (write-off, not cash).';

ALTER TABLE public.purchase_order_key_account_payment_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_order_key_account_payment_allocations FROM authenticated;
REVOKE ALL ON TABLE public.purchase_order_key_account_payment_allocations FROM anon;
GRANT ALL ON TABLE public.purchase_order_key_account_payment_allocations TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Pending discount: intended line split (applied when Sales Head approves)
-- ---------------------------------------------------------------------------
ALTER TABLE public.key_account_settlement_discount_requests
  ADD COLUMN IF NOT EXISTS line_allocations jsonb;

COMMENT ON COLUMN public.key_account_settlement_discount_requests.line_allocations IS
  'Pending brand/line split: [{ purchase_order_item_id, discount }]. Applied to payment allocations on approve.';
