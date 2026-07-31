-- Key Account PO payments: settlement discount (commercial write-off) so cash + discount can close a PO.
-- Cash stays in `amount`; concession is tracked separately and never counted as collected cash.

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_key_account_payments
  ADD COLUMN IF NOT EXISTS settlement_discount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_discount_reason text;

ALTER TABLE public.purchase_order_key_account_payments
  DROP CONSTRAINT IF EXISTS purchase_order_key_account_payments_amount_positive;

ALTER TABLE public.purchase_order_key_account_payments
  DROP CONSTRAINT IF EXISTS purchase_order_key_account_payments_amount_or_discount_check;

ALTER TABLE public.purchase_order_key_account_payments
  ADD CONSTRAINT purchase_order_key_account_payments_amount_or_discount_check
  CHECK (
    amount >= 0::numeric
    AND settlement_discount >= 0::numeric
    AND (amount > 0::numeric OR settlement_discount > 0::numeric)
  );

ALTER TABLE public.purchase_order_key_account_payments
  DROP CONSTRAINT IF EXISTS purchase_order_key_account_payments_discount_reason_check;

ALTER TABLE public.purchase_order_key_account_payments
  ADD CONSTRAINT purchase_order_key_account_payments_discount_reason_check
  CHECK (
    settlement_discount <= 0::numeric
    OR (
      settlement_discount_reason IS NOT NULL
      AND length(btrim(settlement_discount_reason)) > 0
    )
  );

COMMENT ON COLUMN public.purchase_order_key_account_payments.settlement_discount IS
  'Commercial / price settlement write-off applied with this payment row (not cash collected).';
COMMENT ON COLUMN public.purchase_order_key_account_payments.settlement_discount_reason IS
  'Required when settlement_discount > 0 (e.g. market price drop).';

-- ---------------------------------------------------------------------------
-- 2) Paid status = cash + settlement discount vs PO total
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_purchase_order_key_account_payment_status(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric(14,2);
  v_applied numeric(14,2);
  v_status text;
BEGIN
  SELECT po.total_amount INTO v_total
  FROM public.purchase_orders po
  WHERE po.id = p_po_id
    AND po.company_account_type = 'Key Accounts';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) + COALESCE(SUM(p.settlement_discount), 0)
  INTO v_applied
  FROM public.purchase_order_key_account_payments p
  WHERE p.purchase_order_id = p_po_id;

  IF v_applied <= 0 THEN
    v_status := 'unpaid';
  ELSIF v_applied + 0.0001 >= v_total THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.purchase_orders
  SET key_account_payment_status = v_status,
      updated_at = now()
  WHERE id = p_po_id
    AND company_account_type = 'Key Accounts';
END;
$$;

COMMENT ON FUNCTION public.refresh_purchase_order_key_account_payment_status(uuid) IS
  'Recomputes key_account_payment_status from sum(cash + settlement_discount) vs total_amount (Key Account POs only).';

-- ---------------------------------------------------------------------------
-- 3) BEFORE INSERT: cap cash + discount against remaining balance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_key_account_payments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po RECORD;
  applied_so_far numeric(14,2);
  pending_ok boolean;
  post_wh_ok boolean;
  is_consignment boolean;
  v_amount numeric(14,2);
  v_discount numeric(14,2);
BEGIN
  SELECT
    id,
    company_id,
    company_account_type,
    workflow_status,
    total_amount,
    key_account_payment_status,
    created_by,
    kam_id,
    po_order_kind
  INTO po
  FROM public.purchase_orders
  WHERE id = NEW.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF po.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
    RAISE EXCEPTION 'Payments ledger applies to Key Account purchase orders only';
  END IF;

  IF NEW.company_id IS DISTINCT FROM po.company_id THEN
    RAISE EXCEPTION 'company_id must match purchase order company';
  END IF;

  IF NOT public.key_account_user_may_record_po_payment(po.id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to record payment for this purchase order';
  END IF;

  IF po.key_account_payment_status = 'paid' THEN
    RAISE EXCEPTION 'This purchase order is already fully paid';
  END IF;

  v_amount := COALESCE(NEW.amount, 0);
  v_discount := COALESCE(NEW.settlement_discount, 0);
  NEW.amount := v_amount;
  NEW.settlement_discount := v_discount;

  IF v_discount > 0 THEN
    NEW.settlement_discount_reason := nullif(btrim(COALESCE(NEW.settlement_discount_reason, '')), '');
    IF NEW.settlement_discount_reason IS NULL THEN
      RAISE EXCEPTION 'Settlement discount reason is required';
    END IF;
  ELSE
    NEW.settlement_discount_reason := NULL;
  END IF;

  IF v_amount <= 0 AND v_discount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount and/or settlement discount';
  END IF;

  SELECT
    COALESCE(SUM(amount), 0) + COALESCE(SUM(settlement_discount), 0)
  INTO applied_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = NEW.purchase_order_id;

  IF applied_so_far + v_amount + v_discount > po.total_amount + 0.0001 THEN
    RAISE EXCEPTION 'Payment + settlement discount exceeds remaining balance';
  END IF;

  pending_ok := po.workflow_status = ANY (
    ARRAY[
      'kam_pending'::text,
      'director_pending'::text,
      'admin_pending'::text,
      'approved'::text
    ]
  );

  post_wh_ok := po.workflow_status = ANY (
    ARRAY[
      'warehouse_reserved'::text,
      'fulfilled'::text,
      'partial_delivered'::text,
      'delivered'::text
    ]
  );

  is_consignment := po.po_order_kind IS NOT DISTINCT FROM 'consignment';

  -- First payment: standard still during approval; consignment may also settle after warehouse.
  -- Additional payments: allowed at any workflow_status / status (while not already paid).
  IF applied_so_far <= 0 THEN
    IF NOT (pending_ok OR (is_consignment AND post_wh_ok)) THEN
      RAISE EXCEPTION
        'Initial payment can only be recorded while the PO is pending internal approval%s',
        CASE WHEN is_consignment THEN ' (or after warehouse for consignment POs)' ELSE '' END;
    END IF;
  END IF;

  NEW.recorded_by := auth.uid();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.purchase_order_key_account_payments_before_insert() IS
  'Validates Key Account PO payment inserts; additional payments allowed at any workflow status; first payment still gated for standard/consignment.';
