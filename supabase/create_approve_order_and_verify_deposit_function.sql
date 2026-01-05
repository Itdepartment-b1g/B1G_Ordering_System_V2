-- ============================================================================
-- APPROVE ORDER AND VERIFY CASH DEPOSIT FUNCTION
-- ============================================================================
-- This function handles order approval for finance team with different logic
-- based on payment method:
-- 1. BANK_TRANSFER/GCASH: Simply approve the order
-- 2. CASH: Approve the order AND verify the linked cash_deposit
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
  v_deposit_id UUID;
  v_company_id UUID;
BEGIN
  -- 1. Get order details
  SELECT payment_method, deposit_id, company_id
  INTO v_order_payment_method, v_deposit_id, v_company_id
  FROM client_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- 2. CRITICAL CHECK: Cash orders require a deposit_id before approval
  IF v_order_payment_method = 'CASH' AND v_deposit_id IS NULL THEN
    RETURN json_build_object(
      'success', false, 
      'message', 'Cash orders cannot be approved without a recorded deposit. Please have the team leader record the cash deposit first.'
    );
  END IF;

  -- 3. Update order status to approved
  UPDATE client_orders
  SET 
    status = 'approved',
    stage = 'admin_approved',
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 4. If payment method is CASH and deposit_id exists, verify the cash_deposit
  IF v_order_payment_method = 'CASH' AND v_deposit_id IS NOT NULL THEN
    -- Update cash deposit status to verified
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
      'message', 'Order approved and cash deposit verified',
      'payment_method', v_order_payment_method,
      'deposit_verified', true
    );
  ELSE
    RETURN json_build_object(
      'success', true, 
      'message', 'Order approved',
      'payment_method', v_order_payment_method,
      'deposit_verified', false
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION approve_order_and_verify_deposit(UUID) TO authenticated;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- Call this function when finance approves an order:
-- SELECT * FROM approve_order_and_verify_deposit('order-uuid-here');
--
-- For Bank Transfer/GCash orders:
-- - Order status changes to 'approved'
-- - No deposit verification needed
--
-- For Cash orders:
-- - Order status changes to 'approved'
-- - Related cash_deposit status changes to 'verified' (if deposit_id exists)
-- - Related financial_transaction status changes to 'completed'
--
-- ============================================================================

