-- Fix: SPLIT (and other cash/cheque) order approve must reliably verify cash_deposits.
-- Problems addressed:
-- 1) Silent 0-row UPDATE still returned deposit_verified=true
-- 2) RLS could block SECURITY DEFINER updates depending on function owner
-- 3) SPLIT cash detection only ran when payment_mode = 'SPLIT' exactly
-- 4) Stuck deposits where all linked orders are already admin_approved

DROP FUNCTION IF EXISTS approve_order_and_verify_deposit(UUID);
DROP FUNCTION IF EXISTS approve_order_and_verify_deposit(UUID, UUID);

CREATE OR REPLACE FUNCTION approve_order_and_verify_deposit(
  p_order_id UUID,
  p_approver_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_order_payment_method TEXT;
  v_order_payment_mode TEXT;
  v_order_payment_splits JSONB;
  v_deposit_id UUID;
  v_company_id UUID;
  v_order_total NUMERIC;
  v_has_cash_or_cheque BOOLEAN := FALSE;
  v_deposit_rows INTEGER := 0;
  v_item RECORD;
BEGIN
  IF p_approver_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Approver is required');
  END IF;

  SELECT payment_method, payment_mode, payment_splits, deposit_id, company_id, total_amount
  INTO v_order_payment_method, v_order_payment_mode, v_order_payment_splits, v_deposit_id, v_company_id, v_order_total
  FROM client_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- FULL cash/cheque.
  -- IMPORTANT: use COALESCE so NULL payment_method (typical for SPLIT) becomes FALSE,
  -- not NULL. `IF NOT NULL` never enters, which skipped SPLIT payment_splits detection.
  v_has_cash_or_cheque := (COALESCE(v_order_payment_method, '') IN ('CASH', 'CHEQUE'));

  -- SPLIT (or any order with payment_splits array containing CASH/CHEQUE)
  IF NOT v_has_cash_or_cheque
     AND v_order_payment_splits IS NOT NULL
     AND jsonb_typeof(v_order_payment_splits) = 'array'
  THEN
    v_has_cash_or_cheque := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_order_payment_splits) AS elem
      WHERE upper(trim(COALESCE(elem->>'method', ''))) IN ('CASH', 'CHEQUE')
    );
  END IF;

  IF v_has_cash_or_cheque
     AND v_deposit_id IS NULL
     AND COALESCE(v_order_total, 0) > 0
  THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cash/Cheque orders cannot be approved without a recorded deposit. Please have the team leader record the deposit first.'
    );
  END IF;

  UPDATE client_orders
  SET
    status = 'approved',
    stage = 'admin_approved',
    approved_by = p_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  FOR v_item IN
    SELECT variant_id, quantity
    FROM client_order_items
    WHERE client_order_id = p_order_id
  LOOP
    UPDATE main_inventory
    SET
      stock = GREATEST(0, stock - v_item.quantity),
      allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_item.quantity),
      updated_at = NOW()
    WHERE variant_id = v_item.variant_id
      AND company_id = v_company_id;
  END LOOP;

  IF v_has_cash_or_cheque AND v_deposit_id IS NOT NULL THEN
    UPDATE cash_deposits
    SET
      status = 'verified',
      updated_at = NOW()
    WHERE id = v_deposit_id
      AND company_id = v_company_id;

    GET DIAGNOSTICS v_deposit_rows = ROW_COUNT;

    IF v_deposit_rows = 0 THEN
      -- Roll back order approval (EXCEPTION handler returns success=false)
      RAISE EXCEPTION 'Failed to verify cash deposit % for order % (deposit not found or company mismatch)',
        v_deposit_id, p_order_id;
    END IF;

    UPDATE financial_transactions
    SET
      status = 'completed',
      updated_at = NOW()
    WHERE reference_type = 'cash_deposit'
      AND reference_id = v_deposit_id
      AND company_id = v_company_id;

    RETURN json_build_object(
      'success', true,
      'message', 'Order approved and deposit verified',
      'payment_method', v_order_payment_method,
      'payment_mode', v_order_payment_mode,
      'deposit_verified', true,
      'deposit_id', v_deposit_id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Order approved',
    'payment_method', v_order_payment_method,
    'payment_mode', v_order_payment_mode,
    'deposit_verified', false
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_order_and_verify_deposit(UUID, UUID) TO authenticated;

-- Repair stuck deposits: all non-rejected linked orders are already finance-approved
UPDATE cash_deposits d
SET
  status = 'verified',
  updated_at = NOW()
WHERE d.status = 'pending_verification'
  AND EXISTS (
    SELECT 1 FROM client_orders o WHERE o.deposit_id = d.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM client_orders o
    WHERE o.deposit_id = d.id
      AND COALESCE(o.status, '') <> 'rejected'
      AND COALESCE(o.stage, '') <> 'admin_approved'
  );
