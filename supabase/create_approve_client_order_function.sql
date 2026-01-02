-- ============================================================================
-- APPROVE CLIENT ORDER FUNCTION (Refined)
-- ============================================================================
-- This function handles the CONSEQUENCES of a finance approval on an order.
-- 1. Updates order status to 'approved' and stage to 'admin_approved'
-- 2. Records who approved it and when
-- 3. Logs a financial transaction for revenue
-- 
-- NOTE: Stock is already deducted at ORDER CREATION (via create_client_order_v2).
-- ============================================================================

DROP FUNCTION IF EXISTS approve_client_order(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION approve_client_order(
  p_order_id UUID,
  p_approver_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_record RECORD;
  v_company_id UUID;
BEGIN
  -- 1. Fetch the order details
  SELECT * INTO v_order_record
  FROM client_orders
  WHERE id = p_order_id;

  IF v_order_record.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_order_record.status = 'approved' THEN
    RETURN json_build_object('success', false, 'message', 'Order is already approved');
  END IF;

  v_company_id := v_order_record.company_id;

  -- 2. Update order status and approval metadata
  UPDATE client_orders
  SET 
    status = 'approved',
    stage = 'admin_approved',
    approved_by = p_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 3. Record financial transaction (Revenue)
  INSERT INTO financial_transactions (
    company_id,
    transaction_date,
    transaction_type,
    amount,
    status,
    description,
    reference_type,
    reference_id,
    agent_id,
    created_by
  ) VALUES (
    v_company_id,
    CURRENT_DATE,
    'revenue',
    v_order_record.total_amount,
    'completed',
    CONCAT('Revenue from approved order #', v_order_record.order_number),
    'order',
    p_order_id,
    v_order_record.agent_id,
    p_approver_id
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'Order approved and revenue recorded'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION approve_client_order(UUID, UUID) TO authenticated;
