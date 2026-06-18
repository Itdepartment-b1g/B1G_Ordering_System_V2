-- Record approved_by / approved_at when finance approves via approve_order_and_verify_deposit

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
AS $$
DECLARE
  v_order_payment_method TEXT;
  v_order_payment_mode TEXT;
  v_order_payment_splits JSONB;
  v_deposit_id UUID;
  v_company_id UUID;
  v_order_total NUMERIC;
  v_has_cash_or_cheque BOOLEAN := FALSE;
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

  v_has_cash_or_cheque := (v_order_payment_method = 'CASH' OR v_order_payment_method = 'CHEQUE');

  IF NOT v_has_cash_or_cheque AND v_order_payment_mode = 'SPLIT' AND v_order_payment_splits IS NOT NULL THEN
    v_has_cash_or_cheque := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_order_payment_splits) AS elem
      WHERE (elem->>'method') = 'CASH' OR (elem->>'method') = 'CHEQUE'
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
