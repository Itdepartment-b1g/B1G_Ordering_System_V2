-- ALTER purchase_orders: add Key Account commissioned mark columns.
-- Run in Supabase SQL editor (idempotent).
--
-- Adds:
--   commissioned_at  — when a Key Account PO was marked commissioned
--   commissioned_by  — profile that marked it
--
-- Ready-for-commission is derived (not stored):
--   key_account_payment_status = 'paid' AND commissioned_at IS NULL

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS commissioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS commissioned_by uuid;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_commissioned_by_fkey;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_commissioned_by_fkey
  FOREIGN KEY (commissioned_by) REFERENCES public.profiles(id);

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_commissioned_pair_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_commissioned_pair_check
  CHECK (
    (commissioned_at IS NULL AND commissioned_by IS NULL)
    OR (commissioned_at IS NOT NULL AND commissioned_by IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS purchase_orders_commissioned_ready_idx
  ON public.purchase_orders (company_id, commissioned_at)
  WHERE company_account_type = 'Key Accounts'
    AND key_account_payment_status = 'paid';

COMMENT ON COLUMN public.purchase_orders.commissioned_at IS
  'When a Key Account PO was marked commissioned. Null means not yet marked; paid + null = ready.';
COMMENT ON COLUMN public.purchase_orders.commissioned_by IS
  'Profile that marked this Key Account PO as commissioned.';
