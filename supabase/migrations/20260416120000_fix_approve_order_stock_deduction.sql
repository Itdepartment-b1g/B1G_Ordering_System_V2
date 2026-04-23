-- ============================================================================
-- FIX: Deduct main_inventory.stock and allocated_stock on order approval
-- ============================================================================
-- Previously, approve_order_and_verify_deposit only updated order status and
-- deposit verification. It never touched main_inventory, causing:
--   1. allocated_stock to grow indefinitely (included already-sold items)
--   2. stock (Total Stock) to never decrease for sold items
--
-- This migration adds a loop that decrements both stock and allocated_stock
-- for each order item when finance approves the order.
-- ============================================================================

DROP FUNCTION IF EXISTS approve_order_and_verify_deposit(UUID);

CREATE OR REPLACE FUNCTION approve_order_and_verify_deposit(
  p_order_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_payment_method TEXT;
  v_order_payment_mode TEXT;
  v_order_payment_splits JSONB;
  v_deposit_id UUID;
  v_company_id UUID;
  v_has_cash_or_cheque BOOLEAN := FALSE;
  v_item RECORD;
BEGIN
  -- 1. Get order details
  SELECT payment_method, payment_mode, payment_splits, deposit_id, company_id
  INTO v_order_payment_method, v_order_payment_mode, v_order_payment_splits, v_deposit_id, v_company_id
  FROM client_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- 2. Determine whether this order has any CASH/CHEQUE component (FULL or SPLIT)
  v_has_cash_or_cheque := (v_order_payment_method = 'CASH' OR v_order_payment_method = 'CHEQUE');

  IF NOT v_has_cash_or_cheque AND v_order_payment_mode = 'SPLIT' AND v_order_payment_splits IS NOT NULL THEN
    v_has_cash_or_cheque := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_order_payment_splits) AS elem
      WHERE (elem->>'method') = 'CASH' OR (elem->>'method') = 'CHEQUE'
    );
  END IF;

  -- 3. CRITICAL CHECK: Cash/Cheque (FULL or SPLIT) orders require a deposit_id before approval
  IF v_has_cash_or_cheque AND v_deposit_id IS NULL THEN
    RETURN json_build_object(
      'success', false, 
      'message', 'Cash/Cheque orders cannot be approved without a recorded deposit. Please have the team leader record the deposit first.'
    );
  END IF;

  -- 4. Update order status to approved
  UPDATE client_orders
  SET 
    status = 'approved',
    stage = 'admin_approved',
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 4b. Deduct sold quantities from main_inventory (stock and allocated_stock)
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

  -- 5. If order has CASH/CHEQUE component and deposit_id exists, verify the cash_deposit
  IF v_has_cash_or_cheque AND v_deposit_id IS NOT NULL THEN
    -- Update cash/cheque deposit status to verified
    UPDATE cash_deposits
    SET 
      status = 'verified',
      updated_at = NOW()
    WHERE id = v_deposit_id
    AND company_id = v_company_id;

    -- Update related financial transaction to completed
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
      'deposit_verified', true
    );
  ELSE
    RETURN json_build_object(
      'success', true, 
      'message', 'Order approved',
      'payment_method', v_order_payment_method,
      'payment_mode', v_order_payment_mode,
      'deposit_verified', false
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_order_and_verify_deposit(UUID) TO authenticated;
