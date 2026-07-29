-- Key Account consignment POs: float stock now, pay later.
-- Same warehouse_transfer fulfillment as standard KA POs.

-- ---------------------------------------------------------------------------
-- 1) Allow po_order_kind = consignment
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_po_order_kind_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_po_order_kind_check
  CHECK (
    po_order_kind IS NULL
    OR po_order_kind = ANY (ARRAY[
      'standard'::text,
      'rebate_fulfillment'::text,
      'rebate_topup'::text,
      'consignment'::text
    ])
  );

COMMENT ON COLUMN public.purchase_orders.po_order_kind IS
  'standard | rebate_fulfillment | rebate_topup | consignment (float stock; payment deferred).';

-- ---------------------------------------------------------------------------
-- 2) First payment on consignment may be recorded after warehouse stages
--    (standard POs still require initial payment during approval).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_key_account_payments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po RECORD;
  paid_so_far numeric(14,2);
  pending_ok boolean;
  post_wh_ok boolean;
  is_consignment boolean;
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

  SELECT COALESCE(SUM(amount), 0) INTO paid_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = NEW.purchase_order_id;

  IF paid_so_far + NEW.amount > po.total_amount + 0.0001 THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
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

  IF paid_so_far <= 0 THEN
    -- Standard: first payment only while pending approval.
    -- Consignment: may skip create-time payment and settle after warehouse stages.
    IF NOT (pending_ok OR (is_consignment AND post_wh_ok)) THEN
      RAISE EXCEPTION
        'Initial payment can only be recorded while the PO is pending internal approval%s',
        CASE WHEN is_consignment THEN ' (or after warehouse for consignment POs)' ELSE '' END;
    END IF;
  ELSE
    IF NOT post_wh_ok THEN
      RAISE EXCEPTION 'Additional payments are only allowed after warehouse reserved, fulfilled, or delivered';
    END IF;
  END IF;

  NEW.recorded_by := auth.uid();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.purchase_order_key_account_payments_before_insert() IS
  'Validates Key Account PO payment inserts; consignment may record first payment after warehouse stages.';
