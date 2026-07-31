-- Allow additional Key Account payments (cash / settlement discount) at any workflow_status.
-- First payment rules for standard vs consignment are unchanged.

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
